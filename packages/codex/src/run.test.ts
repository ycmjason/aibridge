import type { RunOptions, RunResult } from '@ai-bridge/proc';
import { describe, expect, it } from 'vitest';
import { run } from './run.ts';

describe('codex driver run()', () => {
  it('passes bypass approval flag and config when tools=true with effort', async () => {
    let callCount = 0;
    let execArgs: readonly string[] = [];

    const fakeExec = async (
      _cmd: string,
      args: readonly string[],
      _opts: RunOptions = {},
    ): Promise<RunResult> => {
      callCount++;
      if (args[0] === '--version') {
        return { code: 0, signal: null, stdout: 'codex 0.145.0', stderr: '', timedOut: false };
      }
      execArgs = args;
      return { code: 0, signal: null, stdout: 'Codex answer', stderr: '', timedOut: false };
    };

    const res = await run(
      {
        prompt: 'do task',
        tools: true,
        timeoutSec: 30,
        cwd: '/work',
        backendModel: 'gpt-5.6-sol',
        effort: 'high',
      },
      fakeExec,
    );

    expect(callCount).toBe(2); // 1 version probe + 1 exec
    expect(execArgs).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(execArgs).toContain('-c');
    expect(execArgs).toContain('model_reasoning_effort=high');
    expect(res).toEqual({ ok: true, response: 'Codex answer', exitCode: 0 });
  });

  it('passes read-only approval mode when tools=false', async () => {
    let execArgs: readonly string[] = [];

    const fakeExec = async (
      _cmd: string,
      args: readonly string[],
      _opts: RunOptions = {},
    ): Promise<RunResult> => {
      if (args[0] === '--version') {
        return { code: 0, signal: null, stdout: 'codex 0.145.0', stderr: '', timedOut: false };
      }
      execArgs = args;
      return { code: 0, signal: null, stdout: 'Read-only answer', stderr: '', timedOut: false };
    };

    const res = await run(
      {
        prompt: 'read-only task',
        tools: false,
        timeoutSec: 30,
        cwd: '/work',
        backendModel: 'gpt-5.6-sol',
      },
      fakeExec,
    );

    expect(execArgs).toContain('-s');
    expect(execArgs).toContain('read-only');
    expect(execArgs).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(res).toEqual({ ok: true, response: 'Read-only answer', exitCode: 0 });
  });

  it('maps nonzero exit code to no-answer with real exitCode', async () => {
    const fakeExec = async (
      _cmd: string,
      args: readonly string[],
      _opts: RunOptions = {},
    ): Promise<RunResult> => {
      if (args[0] === '--version') {
        return { code: 0, signal: null, stdout: 'codex 0.145.0', stderr: '', timedOut: false };
      }
      return { code: 1, signal: null, stdout: '', stderr: 'Codex error', timedOut: false };
    };

    const res = await run(
      {
        prompt: 'test',
        tools: false,
        timeoutSec: 10,
        cwd: '/work',
        backendModel: 'gpt-5.6-sol',
      },
      fakeExec,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('no-answer');
      expect(res.exitCode).toBe(1);
    }
  });

  it('maps timeout correctly', async () => {
    const fakeExec = async (
      _cmd: string,
      args: readonly string[],
      _opts: RunOptions = {},
    ): Promise<RunResult> => {
      if (args[0] === '--version') {
        return { code: 0, signal: null, stdout: 'codex 0.145.0', stderr: '', timedOut: false };
      }
      return { code: null, signal: 'SIGTERM', stdout: '', stderr: '', timedOut: true };
    };

    const res = await run(
      {
        prompt: 'test',
        tools: false,
        timeoutSec: 10,
        cwd: '/work',
        backendModel: 'gpt-5.6-sol',
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
    const fakeExec = async (_cmd: string, args: readonly string[]): Promise<RunResult> => {
      if (args[0] === '--version') {
        const err = new Error('spawn codex ENOENT') as Error & { code?: string };
        err.code = 'ENOENT';
        throw err;
      }
      return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false };
    };

    const res = await run(
      {
        prompt: 'test',
        tools: false,
        timeoutSec: 10,
        cwd: '/work',
        backendModel: 'gpt-5.6-sol',
      },
      fakeExec,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('not-found');
      expect(res.exitCode).toBeNull();
    }
  });

  it('returns not-found if version check yields incompatible version', async () => {
    const fakeExec = async (_cmd: string, args: readonly string[]): Promise<RunResult> => {
      if (args[0] === '--version') {
        return { code: 0, signal: null, stdout: 'codex 0.100.0', stderr: '', timedOut: false };
      }
      return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false };
    };

    const res = await run(
      {
        prompt: 'test',
        tools: false,
        timeoutSec: 10,
        cwd: '/work',
        backendModel: 'gpt-5.6-sol',
      },
      fakeExec,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('not-found');
    }
  });
});
