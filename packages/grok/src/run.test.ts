import type { RunOptions, RunResult } from '@aibridge/proc';
import { describe, expect, it } from 'vitest';
import { run } from './run.ts';

describe('grok driver run()', () => {
  it('passes argv for tools=true with effort and captures stdout on success', async () => {
    let capturedCmd = '';
    let capturedArgs: readonly string[] = [];

    const fakeExec = async (
      cmd: string,
      args: readonly string[],
      _opts: RunOptions = {},
    ): Promise<RunResult> => {
      capturedCmd = cmd;
      capturedArgs = args;
      return { code: 0, signal: null, stdout: 'Grok response', stderr: '', timedOut: false };
    };

    const res = await run(
      {
        prompt: 'test prompt',
        tools: true,
        timeoutSec: 30,
        cwd: '/work',
        backendModel: 'grok-4.5',
        effort: 'high',
      },
      fakeExec,
    );

    expect(capturedCmd).toBe('grok');
    expect(capturedArgs).toEqual([
      '-p',
      'test prompt',
      '--model',
      'grok-4.5',
      '--reasoning-effort',
      'high',
      '--permission-mode',
      'bypassPermissions',
    ]);
    expect(res).toEqual({ ok: true, response: 'Grok response', exitCode: 0 });
  });

  it('passes argv for tools=false without bypassPermissions flag', async () => {
    let capturedArgs: readonly string[] = [];

    const fakeExec = async (
      _cmd: string,
      args: readonly string[],
      _opts: RunOptions = {},
    ): Promise<RunResult> => {
      capturedArgs = args;
      return { code: 0, signal: null, stdout: 'Read-only answer', stderr: '', timedOut: false };
    };

    const res = await run(
      {
        prompt: 'read-only task',
        tools: false,
        timeoutSec: 30,
        cwd: '/work',
        backendModel: 'grok-4.5',
      },
      fakeExec,
    );

    expect(capturedArgs).toEqual(['-p', 'read-only task', '--model', 'grok-4.5']);
    expect(capturedArgs).not.toContain('--permission-mode');
    expect(res).toEqual({ ok: true, response: 'Read-only answer', exitCode: 0 });
  });

  it('maps nonzero exit code to no-answer with real exitCode', async () => {
    const fakeExec = async (): Promise<RunResult> => {
      return { code: 2, signal: null, stdout: '', stderr: 'Fatal error', timedOut: false };
    };

    const res = await run(
      {
        prompt: 'test',
        tools: false,
        timeoutSec: 10,
        cwd: '/work',
        backendModel: 'grok-4.5',
      },
      fakeExec,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('no-answer');
      expect(res.exitCode).toBe(2);
    }
  });

  it('maps timeout correctly', async () => {
    const fakeExec = async (): Promise<RunResult> => {
      return { code: null, signal: 'SIGTERM', stdout: '', stderr: '', timedOut: true };
    };

    const res = await run(
      {
        prompt: 'test',
        tools: false,
        timeoutSec: 10,
        cwd: '/work',
        backendModel: 'grok-4.5',
      },
      fakeExec,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('timeout');
      expect(res.exitCode).toBeNull();
    }
  });

  it('maps ENOENT spawn error to not-found with null exitCode', async () => {
    const fakeExec = async (): Promise<RunResult> => {
      const err = new Error('spawn grok ENOENT') as Error & { code?: string };
      err.code = 'ENOENT';
      throw err;
    };

    const res = await run(
      {
        prompt: 'test',
        tools: false,
        timeoutSec: 10,
        cwd: '/work',
        backendModel: 'grok-4.5',
      },
      fakeExec,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('not-found');
      expect(res.exitCode).toBeNull();
    }
  });
});
