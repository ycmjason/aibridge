import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  beginDelegatedRun,
  listRuns,
  parseEtimeSeconds,
  type RunMeta,
  readRunLogs,
  startRun,
} from './runlog.ts';

describe('runlog parseEtimeSeconds', () => {
  it('parses mm:ss', () => {
    expect(parseEtimeSeconds('01:23')).toBe(83);
    expect(parseEtimeSeconds('00:05')).toBe(5);
  });

  it('parses hh:mm:ss', () => {
    expect(parseEtimeSeconds('01:02:03')).toBe(3723);
  });

  it('parses dd-hh:mm:ss', () => {
    expect(parseEtimeSeconds('1-02:03:04')).toBe(93784);
  });

  it('handles whitespace and invalid formats', () => {
    expect(parseEtimeSeconds('  01:23  ')).toBe(83);
    expect(parseEtimeSeconds('')).toBeNull();
    expect(parseEtimeSeconds('invalid')).toBeNull();
  });
});

describe('runlog store and prune', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'aibridge-runlog-test-'));
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
      pid: meta.pid !== undefined ? meta.pid : 12345,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt ?? null,
      lastActivityAt: meta.lastActivityAt ?? meta.startedAt,
      status: meta.status,
      exitCode: meta.exitCode ?? null,
    };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(fullMeta, null, 2), 'utf8');
    writeFileSync(join(dir, 'stdout.log'), 'test stdout\n', 'utf8');
    writeFileSync(join(dir, 'stderr.log'), '', 'utf8');
    return fullMeta;
  }

  it('handles mixed ids (UUID + timestamp) and prunes oldest non-live by startedAt', () => {
    const t0 = new Date('2026-09-15T10:00:00Z');
    const t1 = new Date('2026-09-15T11:00:00Z');
    const t2 = new Date('2026-09-15T12:00:00Z');
    const t3 = new Date('2026-09-15T13:00:00Z');

    // Old UUID dir (started 2 hours ago, done)
    const uuidDoneId = 'f724ab3f-3030-45f5-9d35-b9bc1c150ff0';
    helperWriteRun(uuidDoneId, {
      startedAt: t0.toISOString(),
      status: 'done',
      endedAt: t0.toISOString(),
    });

    // Old timestamp dir (done, started 1 hour ago)
    const oldTsDoneId = '20260915-110000-plan-aabb';
    helperWriteRun(oldTsDoneId, {
      startedAt: t1.toISOString(),
      status: 'done',
      endedAt: t1.toISOString(),
    });

    // Live timestamp dir (running, started at t2)
    const liveTsId = '20260915-120000-plan-ccdd';
    helperWriteRun(liveTsId, { startedAt: t2.toISOString(), status: 'running', pid: 555 });

    // Now start a new run with keep: 2.
    // Non-live runs: [oldTsDoneId (t1), uuidDoneId (t0)].
    // Keep 2 means both oldTsDoneId and uuidDoneId remain.
    // If we add another done run or test with keep: 1, the oldest (uuidDoneId) gets pruned.
    startRun('implement', 'new implement run', {
      runsDir: tempDir,
      now: () => t3,
      keep: 1,
      pidAlive: pid => pid === 555,
    });

    const runs = listRuns({ runsDir: tempDir, now: () => t3, pidAlive: pid => pid === 555 });
    const runIds = runs.map(r => r.id);

    // uuidDoneId (t0) should be pruned because keep=1 for non-live runs, so only oldTsDoneId (t1) is kept among done
    expect(runIds).not.toContain(uuidDoneId);
    expect(runIds).toContain(oldTsDoneId);
    expect(runIds).toContain(liveTsId);
  });

  it('exempts live runs from pruning even when exceeding keep limit', () => {
    const t1 = new Date('2026-09-15T11:00:00Z');
    const t2 = new Date('2026-09-15T12:00:00Z');
    const t3 = new Date('2026-09-15T13:00:00Z');

    // 3 running-alive runs
    helperWriteRun('run-live-1', { startedAt: t1.toISOString(), status: 'running', pid: 101 });
    helperWriteRun('run-live-2', { startedAt: t2.toISOString(), status: 'running', pid: 102 });
    helperWriteRun('run-live-3', { startedAt: t3.toISOString(), status: 'running', pid: 103 });

    // 3 done older runs
    helperWriteRun('run-done-1', {
      startedAt: new Date('2026-09-15T07:00:00Z').toISOString(),
      status: 'done',
    });
    helperWriteRun('run-done-2', {
      startedAt: new Date('2026-09-15T08:00:00Z').toISOString(),
      status: 'done',
    });
    helperWriteRun('run-done-3', {
      startedAt: new Date('2026-09-15T09:00:00Z').toISOString(),
      status: 'done',
    });

    // New run with keep: 1
    startRun('plan', 'new plan', {
      runsDir: tempDir,
      now: () => new Date('2026-09-15T14:00:00Z'),
      keep: 1,
      pidAlive: pid => [101, 102, 103].includes(pid),
    });

    const runs = listRuns({
      runsDir: tempDir,
      now: () => new Date('2026-09-15T14:00:00Z'),
      pidAlive: pid => [101, 102, 103].includes(pid),
    });
    const runIds = runs.map(r => r.id);

    // All 3 running remain
    expect(runIds).toContain('run-live-1');
    expect(runIds).toContain('run-live-2');
    expect(runIds).toContain('run-live-3');

    // Only 1 newest done (run-done-3, from 09:00) remains; 2 oldest done (run-done-1, run-done-2) deleted
    expect(runIds).toContain('run-done-3');
    expect(runIds).not.toContain('run-done-1');
    expect(runIds).not.toContain('run-done-2');
  });

  it('does not delete an active run when its name sorts first (UUID live vs newer timestamp done)', () => {
    // A UUID live run whose name might lexicographically sort before or after
    const uuidLive = '00000000-live-uuid';
    helperWriteRun(uuidLive, {
      startedAt: new Date('2026-09-15T12:00:00Z').toISOString(),
      status: 'running',
      pid: 201,
    });

    // 2 done runs
    helperWriteRun('20260915-110000-done-1', {
      startedAt: new Date('2026-09-15T11:00:00Z').toISOString(),
      status: 'done',
    });
    helperWriteRun('20260915-100000-done-2', {
      startedAt: new Date('2026-09-15T10:00:00Z').toISOString(),
      status: 'done',
    });

    startRun('plan', 'test', {
      runsDir: tempDir,
      now: () => new Date('2026-09-15T13:00:00Z'),
      keep: 1,
      pidAlive: pid => pid === 201,
    });

    const runs = listRuns({
      runsDir: tempDir,
      now: () => new Date('2026-09-15T13:00:00Z'),
      pidAlive: pid => pid === 201,
    });
    const ids = runs.map(r => r.id);
    expect(ids).toContain(uuidLive);
  });

  it('reconciles running with pidAlive false to stale and prunes it', () => {
    helperWriteRun('dead-run', {
      startedAt: new Date('2026-09-15T10:00:00Z').toISOString(),
      status: 'running',
      pid: 999,
    });

    const runsBefore = listRuns({
      runsDir: tempDir,
      now: () => new Date('2026-09-15T12:00:00Z'),
      pidAlive: () => false,
    });

    expect(runsBefore[0]?.status).toBe('stale');
    expect(runsBefore[0]?.endedAt).toBe('2026-09-15T10:00:00.000Z');

    // On next startRun with keep 0, this stale run is pruned
    startRun('plan', 'test', {
      runsDir: tempDir,
      now: () => new Date('2026-09-15T12:00:00Z'),
      keep: 0,
      pidAlive: () => false,
    });

    const runsAfter = listRuns({
      runsDir: tempDir,
      now: () => new Date('2026-09-15T12:00:00Z'),
      pidAlive: () => false,
    });
    expect(runsAfter.find(r => r.id === 'dead-run')).toBeUndefined();
  });

  it('treats pid === null within grace as running, and beyond grace as stale', () => {
    const now = new Date('2026-09-15T12:00:20Z');
    // Started 10s ago (within 30s grace)
    helperWriteRun('null-pid-fresh', {
      startedAt: new Date('2026-09-15T12:00:10Z').toISOString(),
      status: 'running',
      pid: null,
    });
    // Started 40s ago (beyond 30s grace)
    helperWriteRun('null-pid-old', {
      startedAt: new Date('2026-09-15T11:59:40Z').toISOString(),
      status: 'running',
      pid: null,
    });

    const runs = listRuns({
      runsDir: tempDir,
      now: () => now,
      pidAlive: () => false,
    });

    const fresh = runs.find(r => r.id === 'null-pid-fresh');
    const old = runs.find(r => r.id === 'null-pid-old');

    expect(fresh?.status).toBe('running');
    expect(old?.status).toBe('stale');
  });

  it('keeps running status when pidAlive returns true (e.g. EPERM)', () => {
    helperWriteRun('eperm-run', {
      startedAt: new Date('2026-09-15T10:00:00Z').toISOString(),
      status: 'running',
      pid: 1, // PID 1 often returns EPERM for non-root
    });

    const runs = listRuns({
      runsDir: tempDir,
      now: () => new Date('2026-09-15T12:00:00Z'),
      pidAlive: () => true,
    });

    expect(runs[0]?.status).toBe('running');
  });

  it('prunes unreadable directory using directory mtime', () => {
    const unreadableDir = join(tempDir, 'corrupt-run');
    mkdirSync(unreadableDir, { recursive: true });
    // Set mtime to old time
    utimesSync(unreadableDir, new Date('2026-09-15T05:00:00Z'), new Date('2026-09-15T05:00:00Z'));

    startRun('plan', 'new run', {
      runsDir: tempDir,
      now: () => new Date('2026-09-15T12:00:00Z'),
      keep: 0,
    });

    const runs = listRuns({ runsDir: tempDir });
    expect(runs.find(r => r.id === 'corrupt-run')).toBeUndefined();
  });

  it('returns valid id and no-op methods when startRun cannot write to disk', () => {
    // Point runsDir to a file so mkdir fails
    const filePath = join(tempDir, 'file-blocking-dir');
    writeFileSync(filePath, 'blocking file', 'utf8');

    const run = startRun('plan', 'failing run', {
      runsDir: filePath,
    });

    expect(run.id).toBeTruthy();
    expect(run.dir).toBe('');

    // Calling methods should not throw
    expect(() => {
      run.setPid(123);
      run.stdout('out');
      run.stderr('err');
      run.touch();
      run.finish('done', 0);
    }).not.toThrow();
  });

  it('beginDelegatedRun writes announcement to stderr and warning if failed to persist', () => {
    const errChunks: string[] = [];
    const mockStderr = {
      write(chunk: string) {
        errChunks.push(chunk);
      },
    };

    const run = beginDelegatedRun('plan', 'test detail', mockStderr, { runsDir: tempDir });
    expect(errChunks[0]).toBe(`aibridge: run ${run.id}\n`);

    // With failing directory:
    const filePath = join(tempDir, 'file-block');
    writeFileSync(filePath, 'block', 'utf8');
    errChunks.length = 0;
    const failedRun = beginDelegatedRun('plan', 'test detail', mockStderr, { runsDir: filePath });
    expect(errChunks[0]).toBe(`aibridge: run ${failedRun.id}\n`);
    expect(errChunks[1]).toContain('warning: failed to persist run log');
  });

  it('updates lastActivityAt on stdout, stderr, touch with activityFlushMs: 0', () => {
    let currentTime = new Date('2026-09-15T12:00:00Z');
    const run = startRun('plan', 'detail', {
      runsDir: tempDir,
      now: () => currentTime,
      activityFlushMs: 0,
    });

    let logs = readRunLogs(run.id, { runsDir: tempDir });
    expect(logs?.meta.lastActivityAt).toBe('2026-09-15T12:00:00.000Z');

    currentTime = new Date('2026-09-15T12:00:05Z');
    run.touch();
    logs = readRunLogs(run.id, { runsDir: tempDir });
    expect(logs?.meta.lastActivityAt).toBe('2026-09-15T12:00:05.000Z');

    currentTime = new Date('2026-09-15T12:00:10Z');
    run.stdout('some stdout');
    logs = readRunLogs(run.id, { runsDir: tempDir });
    expect(logs?.meta.lastActivityAt).toBe('2026-09-15T12:00:10.000Z');
    expect(logs?.stdout).toBe('some stdout');

    currentTime = new Date('2026-09-15T12:00:15Z');
    run.stderr('some stderr');
    logs = readRunLogs(run.id, { runsDir: tempDir });
    expect(logs?.meta.lastActivityAt).toBe('2026-09-15T12:00:15.000Z');
    expect(logs?.stderr).toBe('some stderr');
  });

  it('does not throw or delete run dir if log writing fails mid-run', () => {
    const run = startRun('plan', 'detail', {
      runsDir: tempDir,
    });

    // Delete stdout.log
    rmSync(join(run.dir, 'stdout.log'), { force: true });
    // Make stdout.log a directory so appendFileSync fails
    mkdirSync(join(run.dir, 'stdout.log'), { recursive: true });

    expect(() => {
      run.stdout('failing write');
    }).not.toThrow();

    // The run directory itself is not deleted
    const logs = readRunLogs(run.id, { runsDir: tempDir });
    expect(logs).not.toBeNull();
  });
});
