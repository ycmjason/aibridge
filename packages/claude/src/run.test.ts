import type { RunOptions, RunResult } from '@aibridge/proc';
import { describe, expect, it } from 'vitest';
import { run } from './run.ts';

describe('claude driver run()', () => {
  it('passes arguments for tools=true with effort and returns stdout response', async () => {
    let capturedCmd = '';
    let capturedArgs: readonly string[] = [];

    const fakeExec = async (
      cmd: string,
      args: readonly string[],
      _opts: RunOptions = {},
    ): Promise<RunResult> => {
      capturedCmd = cmd;
      capturedArgs = args;
      return { code: 0, signal: null, stdout: 'Claude output', stderr: '', timedOut: false };
    };

    const res = await run(
      {
        prompt: 'test prompt',
        tools: true,
        timeoutSec: 40,
        cwd: '/work',
        backendModel: 'sonnet',
        effort: 'high',
      },
      fakeExec,
    );

    expect(capturedCmd).toBe('claude');
    expect(capturedArgs).toEqual([
      '-p',
      'test prompt',
      '--model',
      'sonnet',
      '--effort',
      'high',
      '--dangerously-skip-permissions',
    ]);
    expect(res).toEqual({ ok: true, response: 'Claude output', exitCode: 0 });
  });

  it('passes arguments for tools=false without dangerously-skip-permissions', async () => {
    let capturedArgs: readonly string[] = [];

    const fakeExec = async (
      _cmd: string,
      args: readonly string[],
      _opts: RunOptions = {},
    ): Promise<RunResult> => {
      capturedArgs = args;
      return {
        code: 0,
        signal: null,
        stdout: 'Claude read-only output',
        stderr: '',
        timedOut: false,
      };
    };

    const res = await run(
      {
        prompt: 'test prompt',
        tools: false,
        timeoutSec: 40,
        cwd: '/work',
        backendModel: 'sonnet',
      },
      fakeExec,
    );

    expect(capturedArgs).toEqual(['-p', 'test prompt', '--model', 'sonnet']);
    expect(capturedArgs).not.toContain('--dangerously-skip-permissions');
    expect(res).toEqual({ ok: true, response: 'Claude read-only output', exitCode: 0 });
  });

  it('maps nonzero exit code to no-answer with real exitCode', async () => {
    const fakeExec = async (): Promise<RunResult> => {
      return { code: 1, signal: null, stdout: '', stderr: 'API error', timedOut: false };
    };

    const res = await run(
      {
        prompt: 'test',
        tools: false,
        timeoutSec: 10,
        cwd: '/work',
        backendModel: 'sonnet',
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
    const fakeExec = async (): Promise<RunResult> => {
      return { code: null, signal: 'SIGTERM', stdout: '', stderr: '', timedOut: true };
    };

    const res = await run(
      {
        prompt: 'test',
        tools: false,
        timeoutSec: 10,
        cwd: '/work',
        backendModel: 'sonnet',
      },
      fakeExec,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('timeout');
      expect(res.exitCode).toBeNull();
    }
  });

  it('handles spawn failure (ENOENT mapped to not-found)', async () => {
    const fakeExec = async (): Promise<RunResult> => {
      const err = new Error('spawn claude ENOENT') as Error & { code?: string };
      err.code = 'ENOENT';
      throw err;
    };

    const res = await run(
      {
        prompt: 'test',
        tools: false,
        timeoutSec: 10,
        cwd: '/work',
        backendModel: 'sonnet',
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
