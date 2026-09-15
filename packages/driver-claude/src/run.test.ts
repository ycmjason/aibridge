import type { RunOptions, RunResult } from '@aibridge/proc';
import { describe, expect, it } from 'vitest';
import { run } from './run.ts';

describe('claude driver run() argv and basics', () => {
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
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
    ]);
    expect(capturedArgs).not.toContain('--forward-subagent-text');
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

    expect(capturedArgs).toEqual([
      '-p',
      'test prompt',
      '--model',
      'sonnet',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
    ]);
    expect(capturedArgs).not.toContain('--dangerously-skip-permissions');
    expect(capturedArgs).not.toContain('--forward-subagent-text');
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

describe('claude stream-json parsing and log forwarding', () => {
  const task = {
    prompt: 'review it',
    tools: false,
    timeoutSec: 30,
    cwd: '/work',
    backendModel: 'claude-sonnet-4-6',
  };

  const assistant = (...blocks: Array<Record<string, unknown>>) =>
    JSON.stringify({
      type: 'assistant',
      message: { id: 'msg_0', type: 'message', role: 'assistant', content: blocks },
    });
  const text = (t: string) => assistant({ type: 'text', text: t });

  it('returns the last assistant message, not the narration in front of it', async () => {
    const stdout = [
      JSON.stringify({ type: 'system', message: { role: 'system', content: [] } }),
      text("I'll review the diff against the plan contract, then write the report."),
      JSON.stringify({ type: 'user', message: { role: 'user', content: [] } }),
      text('PASS'),
      JSON.stringify({ type: 'result', stop_reason: 'end_turn' }),
      '',
    ].join('\n');

    const res = await run(task, async () => ({
      code: 0,
      signal: null,
      stdout,
      stderr: '',
      timedOut: false,
    }));

    expect(res).toEqual({ ok: true, response: 'PASS', exitCode: 0 });
  });

  it('never lets a thinking block reach the answer or log', async () => {
    const stdout = `${assistant(
      { type: 'thinking', thinking: 'The user wants PASS. Let me think.' },
      { type: 'text', text: 'PASS' },
    )}\n`;
    const log: string[] = [];

    const res = await run(
      { ...task, onStdout: c => log.push(c) },
      async (_cmd, _args, opts = {}) => {
        opts.onStdout?.(stdout);
        return { code: 0, signal: null, stdout, stderr: '', timedOut: false };
      },
    );

    expect(res).toMatchObject({ ok: true, response: 'PASS' });
    expect(log.join('')).toBe('PASS\n');
    expect(log.join('')).not.toContain('The user wants PASS');
  });

  it('prefers the terminal result frame over the last assistant turn', async () => {
    const stdout = [
      text('Thinking out loud before answering.'),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: 'PASS',
        stop_reason: 'end_turn',
      }),
      '',
    ].join('\n');

    const res = await run(task, async () => ({
      code: 0,
      signal: null,
      stdout,
      stderr: '',
      timedOut: false,
    }));

    expect(res).toEqual({ ok: true, response: 'PASS', exitCode: 0 });
  });

  it('never returns the raw NDJSON dump when the stream carried no answer text', async () => {
    const stdout = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'abc',
        tools: ['read_file', 'bash'],
        slash_commands: ['review'],
      }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: [] } }),
      JSON.stringify({ type: 'result', subtype: 'success', stop_reason: 'end_turn' }),
      '',
    ].join('\n');

    const res = await run(task, async () => ({
      code: 0,
      signal: null,
      stdout,
      stderr: '',
      timedOut: false,
    }));

    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ kind: 'no-answer' });
    expect(JSON.stringify(res)).not.toContain('slash_commands');
  });

  it('streams prose to the log rather than NDJSON across chunk boundaries', async () => {
    const stdout = `${text('Working on it.')}\n${text('PASS')}\n`;
    const log: string[] = [];

    await run({ ...task, onStdout: c => log.push(c) }, async (_cmd, _args, opts = {}) => {
      for (let i = 0; i < stdout.length; i += 7) opts.onStdout?.(stdout.slice(i, i + 7));
      return { code: 0, signal: null, stdout, stderr: '', timedOut: false };
    });

    expect(log.join('')).toBe('Working on it.\nPASS\n');
  });

  it('logs the terminal result text when it differs from the assistant turn', async () => {
    const log: string[] = [];
    const stdout = [
      text('Thinking out loud before answering.'),
      JSON.stringify({ type: 'result', subtype: 'success', result: 'PASS' }),
      '',
    ].join('\n');

    await run({ ...task, onStdout: c => log.push(c) }, async (_cmd, _args, opts = {}) => {
      opts.onStdout?.(stdout);
      return { code: 0, signal: null, stdout, stderr: '', timedOut: false };
    });

    expect(log.join('')).toBe('Thinking out loud before answering.\nPASS\n');
  });

  it('does not log the terminal result twice when it repeats the assistant turn', async () => {
    const log: string[] = [];
    const stdout = [
      text('PASS'),
      JSON.stringify({ type: 'result', subtype: 'success', result: 'PASS' }),
      '',
    ].join('\n');

    await run({ ...task, onStdout: c => log.push(c) }, async (_cmd, _args, opts = {}) => {
      opts.onStdout?.(stdout);
      return { code: 0, signal: null, stdout, stderr: '', timedOut: false };
    });

    expect(log.join('')).toBe('PASS\n');
  });

  it('flushes a trailing line the child left unterminated', async () => {
    const log: string[] = [];
    const stdout = `${text('Done.')}`;

    await run({ ...task, onStdout: c => log.push(c) }, async (_cmd, _args, opts = {}) => {
      opts.onStdout?.(stdout);
      return { code: 0, signal: null, stdout, stderr: '', timedOut: false };
    });

    expect(log.join('')).toBe('Done.\n');
  });

  it('passes non-protocol output through to the log and the answer fallback', async () => {
    const log: string[] = [];
    const stdout = 'You are not authenticated.\n';

    const res = await run({ ...task, onStdout: c => log.push(c) }, async (_c, _a, opts = {}) => {
      opts.onStdout?.(stdout);
      return { code: 1, signal: null, stdout, stderr: 'Auth error', timedOut: false };
    });

    expect(log.join('')).toBe('You are not authenticated.\n');
    expect(res.ok).toBe(false);
  });

  it('stream_event / thinking_delta triggers onActivity, excludes thinking from log and answer', async () => {
    let activityCount = 0;
    const log: string[] = [];
    const stdout = [
      JSON.stringify({
        type: 'stream_event',
        event: { type: 'thinking_delta', thinking: 'internal CoT' },
      }),
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'part' } }),
      text('PASS'),
      '',
    ].join('\n');

    const res = await run(
      {
        ...task,
        onStdout: c => log.push(c),
        onActivity: () => {
          activityCount++;
        },
      },
      async (_cmd, _args, opts = {}) => {
        for (let i = 0; i < stdout.length; i += 10) {
          opts.onStdout?.(stdout.slice(i, i + 10));
        }
        return { code: 0, signal: null, stdout, stderr: '', timedOut: false };
      },
    );

    expect(res).toEqual({ ok: true, response: 'PASS', exitCode: 0 });
    expect(log.join('')).toBe('PASS\n');
    expect(log.join('')).not.toContain('internal CoT');
    expect(activityCount).toBeGreaterThan(0);
  });
});
