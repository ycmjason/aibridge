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
        backendModel: 'grok-4.6',
        effort: 'high',
      },
      fakeExec,
    );

    expect(capturedCmd).toBe('grok');
    expect(capturedArgs).toEqual([
      '-p',
      'test prompt',
      '--model',
      'grok-4.6',
      '--reasoning-effort',
      'high',
      '--permission-mode',
      'bypassPermissions',
      '--output-format',
      'streaming-messages-json',
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
        backendModel: 'grok-4.6',
      },
      fakeExec,
    );

    expect(capturedArgs).toEqual([
      '-p',
      'read-only task',
      '--model',
      'grok-4.6',
      '--output-format',
      'streaming-messages-json',
    ]);
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
        backendModel: 'grok-4.6',
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
        backendModel: 'grok-4.6',
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
        backendModel: 'grok-4.6',
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

describe('grok driver run() sign-in detection', () => {
  const task = {
    prompt: 'p',
    tools: false,
    timeoutSec: 30,
    cwd: '/work',
    backendModel: 'grok-4.6',
  };
  const exec = (stdout: string) => async (): Promise<RunResult> => ({
    code: 0,
    signal: null,
    stdout,
    stderr: '',
    timedOut: false,
  });

  it('treats the CLI sign-in notice as no-answer', async () => {
    const res = await run(task, exec('You are not authenticated.'));
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ kind: 'no-answer', message: /not signed in/ });
  });

  it('keeps a real answer that merely mentions the phrase', async () => {
    const answer = `${'Your endpoint returns "not authenticated" because the bearer token is stale. '.repeat(6)}`;
    const res = await run(task, exec(answer));
    expect(res.ok).toBe(true);
  });
});

describe('grok streaming-messages-json parsing', () => {
  const task = {
    prompt: 'review it',
    tools: false,
    timeoutSec: 30,
    cwd: '/work',
    backendModel: 'grok-4.6',
  };

  const assistant = (...blocks: Array<Record<string, unknown>>) =>
    JSON.stringify({
      type: 'assistant',
      message: { id: 'msg_0', type: 'message', role: 'assistant', content: blocks },
    });
  const text = (t: string) => assistant({ type: 'text', text: t });

  // The bug this whole format switch exists for: in `plain` and `json` output
  // grok glues the verdict onto the tail of its narration ("...report now.PASS"),
  // so review's `/^PASS\b/` never matched and every answer carried the model
  // thinking out loud in front of it.
  it('returns the last assistant message, not the narration in front of it', async () => {
    const stdout = [
      JSON.stringify({ type: 'system', message: { role: 'system', content: [] } }),
      text("I'll review the diff against the plan contract, then write the report."),
      JSON.stringify({ type: 'user', message: { role: 'user', content: [] } }),
      text('PASS'),
      JSON.stringify({ type: 'result', stopReason: 'end_turn' }),
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

  it('never lets a thinking block reach the answer', async () => {
    const stdout = `${assistant(
      { type: 'thinking', thinking: 'The user wants PASS. Let me load a skill first.' },
      { type: 'text', text: 'PASS' },
    )}\n`;

    const res = await run(task, async () => ({
      code: 0,
      signal: null,
      stdout,
      stderr: '',
      timedOut: false,
    }));

    expect(res).toMatchObject({ ok: true, response: 'PASS' });
  });

  it('streams prose to the log rather than NDJSON, across chunk boundaries', async () => {
    const stdout = `${text('Working on it.')}\n${text('PASS')}\n`;
    const log: string[] = [];

    await run({ ...task, onStdout: c => log.push(c) }, async (_cmd, _args, opts = {}) => {
      // Deliberately split mid-frame: the forwarder buffers by line, not by chunk.
      for (let i = 0; i < stdout.length; i += 7) opts.onStdout?.(stdout.slice(i, i + 7));
      return { code: 0, signal: null, stdout, stderr: '', timedOut: false };
    });

    expect(log.join('')).toBe('Working on it.\nPASS\n');
  });

  // Grok's headless docs: `result.result` IS the final assistant message text,
  // and a contentless model response emits no `assistant` line at all.
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

  // Regression: falling back to raw stdout here would hand the caller the whole
  // NDJSON stream as a successful answer — the exact failure mode this format
  // switch exists to stop, just wearing a different hat.
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

  // A contentless model response emits no assistant frame at all, so the log
  // policy has to mirror the answer policy or the log gets everything but the
  // answer. The dedupe keeps the usual case (result repeats the turn) quiet.
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
    const stdout = `${text('Done.')}`; // deliberately no trailing newline

    await run({ ...task, onStdout: c => log.push(c) }, async (_cmd, _args, opts = {}) => {
      opts.onStdout?.(stdout);
      return { code: 0, signal: null, stdout, stderr: '', timedOut: false };
    });

    expect(log.join('')).toBe('Done.\n');
  });

  it('passes non-protocol output through to the log and the answer', async () => {
    const log: string[] = [];
    const stdout = 'You are not authenticated.\n';

    const res = await run({ ...task, onStdout: c => log.push(c) }, async (_c, _a, opts = {}) => {
      opts.onStdout?.(stdout);
      return { code: 0, signal: null, stdout, stderr: '', timedOut: false };
    });

    expect(log.join('')).toBe('You are not authenticated.\n');
    expect(res).toMatchObject({ kind: 'no-answer', message: /not signed in/ });
  });
});
