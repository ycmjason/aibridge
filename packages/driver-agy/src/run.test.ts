import { writeFileSync } from 'node:fs';
import type { RunOptions, RunResult } from '@aibridge/proc';
import { describe, expect, it } from 'vitest';
import { run } from './run.ts';

describe('agy driver run()', () => {
  it('builds args without tools and handles successful execution', async () => {
    let capturedCmd = '';
    let capturedArgs: readonly string[] = [];

    const fakeExec = async (
      cmd: string,
      args: readonly string[],
      _opts: RunOptions = {},
    ): Promise<RunResult> => {
      capturedCmd = cmd;
      capturedArgs = args;
      return { code: 0, signal: null, stdout: 'Hello world', stderr: '', timedOut: false };
    };

    const res = await run(
      {
        prompt: 'do something',
        tools: false,
        timeoutSec: 60,
        cwd: '/test/cwd',
        backendModel: 'gemini-3.7-flash-high',
      },
      fakeExec,
    );

    expect(capturedCmd).toEqual('agy');
    expect(capturedArgs).toEqual([
      '-p',
      'do something',
      '--model',
      'gemini-3.7-flash-high',
      '--print-timeout',
      '60s',
    ]);
    expect(res).toEqual({ ok: true, response: 'Hello world', exitCode: 0 });
  });

  it('uses answer file protocol when tools=true', async () => {
    let capturedArgs: readonly string[] = [];

    const fakeExec = async (
      _cmd: string,
      args: readonly string[],
      _opts: RunOptions = {},
    ): Promise<RunResult> => {
      capturedArgs = args;
      // find answer path from prompt in args
      const prompt = args[1] ?? '';
      const match = prompt.match(/file (\/.*answer\.md)/);
      if (match?.[1]) {
        writeFileSync(match[1], 'Written answer from file');
      }
      return {
        code: 0,
        signal: null,
        stdout: 'Shell cwd was reset to /foo\n',
        stderr: '',
        timedOut: false,
      };
    };

    const res = await run(
      {
        prompt: 'do tool task',
        tools: true,
        timeoutSec: 100,
        cwd: '/repo/root',
        backendModel: 'gemini-3.7-flash-high',
      },
      fakeExec,
    );

    expect(capturedArgs).toContain('--dangerously-skip-permissions');
    expect(capturedArgs).toContain('/repo/root');
    expect(res).toEqual({ ok: true, response: 'Written answer from file', exitCode: 0 });
  });

  it('maps ENOENT spawn error to not-found', async () => {
    const fakeExec = async (): Promise<RunResult> => {
      const err = new Error('spawn agy ENOENT') as Error & { code?: string };
      err.code = 'ENOENT';
      throw err;
    };

    const res = await run(
      {
        prompt: 'test',
        tools: false,
        timeoutSec: 30,
        cwd: '/test/cwd',
        backendModel: 'gemini-3.7-flash-high',
      },
      fakeExec,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('not-found');
      expect(res.exitCode).toBeNull();
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
        cwd: '/test/cwd',
        backendModel: 'gemini-3.7-flash-high',
      },
      fakeExec,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('timeout');
      expect(res.exitCode).toBeNull();
    }
  });

  it('maps no-answer when stdout is empty and no answer file', async () => {
    const fakeExec = async (): Promise<RunResult> => {
      return { code: 0, signal: null, stdout: '', stderr: 'error details', timedOut: false };
    };

    const res = await run(
      {
        prompt: 'test',
        tools: false,
        timeoutSec: 10,
        cwd: '/test/cwd',
        backendModel: 'gemini-3.7-flash-high',
      },
      fakeExec,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('no-answer');
      expect(res.exitCode).toBe(0);
    }
  });
});
