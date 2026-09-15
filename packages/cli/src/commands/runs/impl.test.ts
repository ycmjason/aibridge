import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LocalContext } from '../../context.ts';
import type { RunMeta } from '../../runlog.ts';
import runs, { formatElapsed, formatIdle, statusLabel } from './impl.ts';

describe('runs helpers', () => {
  it('formatElapsed formats seconds and minutes correctly', () => {
    const t0 = new Date('2026-09-15T12:00:00Z').toISOString();
    const t1 = new Date('2026-09-15T12:00:45Z').toISOString();
    const t2 = new Date('2026-09-15T12:03:15Z').toISOString();

    expect(formatElapsed(t0, t1)).toBe('45s');
    expect(formatElapsed(t0, t2)).toBe('3m15s');
  });

  it('formatIdle calculates elapsed idle time since lastActivityAt', () => {
    const lastActivity = new Date('2026-09-15T12:00:00Z').toISOString();
    const nowMs = new Date('2026-09-15T12:00:25Z').getTime();
    expect(formatIdle(lastActivity, nowMs)).toBe('25s');

    const nowMinMs = new Date('2026-09-15T12:02:10Z').getTime();
    expect(formatIdle(lastActivity, nowMinMs)).toBe('2m10s');
  });

  it('statusLabel converts status to upper case', () => {
    expect(statusLabel('running')).toBe('RUNNING');
    expect(statusLabel('stale')).toBe('STALE');
    expect(statusLabel('done')).toBe('DONE');
  });
});

describe('runs command impl', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'aibridge-runs-test-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function helperWriteRun(
    id: string,
    meta: Partial<RunMeta> & { startedAt: string; status: RunMeta['status'] },
  ) {
    const dir = join(tempDir, id);
    mkdirSync(dir, { recursive: true });
    const fullMeta: RunMeta = {
      id,
      command: meta.command ?? 'plan',
      detail: meta.detail ?? 'test detail',
      pid: meta.pid !== undefined ? meta.pid : null,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt ?? null,
      lastActivityAt: meta.lastActivityAt ?? meta.startedAt,
      status: meta.status,
      exitCode: meta.exitCode ?? null,
    };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(fullMeta, null, 2), 'utf8');
    writeFileSync(join(dir, 'stdout.log'), 'test stdout line 1\ntest stdout line 2\n', 'utf8');
    writeFileSync(join(dir, 'stderr.log'), '', 'utf8');
    return fullMeta;
  }

  function createMockContext() {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const ctx: LocalContext = {
      process: {
        cwd: () => '/work',
        stdout: {
          write(chunk: string) {
            stdoutChunks.push(chunk);
            return true;
          },
        },
        stderr: {
          write(chunk: string) {
            stderrChunks.push(chunk);
            return true;
          },
        },
        exitCode: undefined,
      },
    } as unknown as LocalContext;
    return { ctx, stdoutChunks, stderrChunks };
  }

  it('prints human table with IDLE column, running showing idle, done showing -', async () => {
    const t0 = new Date('2026-09-15T12:00:00Z').toISOString();
    const t1 = new Date('2026-09-15T12:01:00Z').toISOString();

    helperWriteRun('run-1', {
      startedAt: t1,
      lastActivityAt: t1,
      status: 'running',
      pid: 99999, // alive in pid probe
    });
    helperWriteRun('run-2', {
      startedAt: t0,
      lastActivityAt: t0,
      endedAt: t1,
      status: 'done',
    });

    const { ctx, stdoutChunks } = createMockContext();
    await runs.call(ctx, { watch: false, json: false }, undefined, {
      runsDir: tempDir,
      pidAlive: () => true,
    });

    const output = stdoutChunks.join('');
    expect(output).toContain('STATUS');
    expect(output).toContain('IDLE');
    expect(output).toContain('RUNNING');
    expect(output).toContain('DONE');
    const doneLine = output.split('\n').find(line => line.includes('run-2'));
    expect(doneLine).toMatch(/\s-\s+test detail$/);
    const runningLine = output.split('\n').find(line => line.includes('run-1'));
    expect(runningLine).not.toMatch(/\s-\s+test detail$/);
  });

  it('reconciles dead running to STALE and outputs in json with lastActivityAt', async () => {
    const t0 = new Date('2026-09-15T12:00:00Z').toISOString();

    helperWriteRun('run-dead', {
      startedAt: t0,
      lastActivityAt: t0,
      status: 'running',
      pid: 88888,
    });

    const { ctx, stdoutChunks } = createMockContext();
    await runs.call(ctx, { watch: false, json: true }, undefined, {
      runsDir: tempDir,
      pidAlive: () => false,
    });

    const output = stdoutChunks.join('');
    const parsed = JSON.parse(output.trim()) as RunMeta;
    expect(parsed.status).toBe('stale');
    expect(parsed.lastActivityAt).toBe(t0);
  });

  it('inspect view displays LAST with idle info', async () => {
    const t0 = new Date('2026-09-15T12:00:00Z').toISOString();
    helperWriteRun('run-inspect', {
      startedAt: t0,
      lastActivityAt: t0,
      status: 'running',
      pid: 77777,
    });

    const { ctx, stdoutChunks } = createMockContext();
    await runs.call(ctx, { watch: false, json: false }, 'run-inspect', {
      runsDir: tempDir,
      pidAlive: () => true,
    });

    const output = stdoutChunks.join('');
    expect(output).toContain('ID:      run-inspect');
    expect(output).toContain('STATUS:  RUNNING');
    expect(output).toContain('LAST:    2026-09-15T12:00:00.000Z');
  });

  it('inspect view does not report idle time for a finished run', async () => {
    const t0 = new Date('2026-09-15T12:00:00Z').toISOString();
    helperWriteRun('run-done', {
      startedAt: t0,
      lastActivityAt: t0,
      endedAt: t0,
      status: 'done',
    });

    const { ctx, stdoutChunks } = createMockContext();
    await runs.call(ctx, { watch: false, json: false }, 'run-done', {
      runsDir: tempDir,
    });

    expect(stdoutChunks.join('')).toContain(`LAST:    ${t0} (-)`);
  });

  it('renders invalid timestamps as unavailable', () => {
    expect(formatElapsed('invalid', null)).toBe('-');
    expect(formatIdle('invalid')).toBe('-');
  });
});
