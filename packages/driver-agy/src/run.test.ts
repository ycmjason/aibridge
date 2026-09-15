import { writeFileSync } from 'node:fs';
import type { RunOptions, RunResult } from '@aibridge/proc';
import { describe, expect, it } from 'vitest';
import { run } from './run.ts';

interface FakeAgyConfig {
  readonly version?: string | null;
  readonly versionError?: Error;
  readonly execError?: Error;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly code?: number | null;
  readonly timedOut?: boolean;
  readonly writeAnswerFile?: string;
  readonly streamChunks?: readonly string[];
}

function fakeAgy(config: FakeAgyConfig = {}): {
  readonly exec: (cmd: string, args: readonly string[], opts?: RunOptions) => Promise<RunResult>;
  readonly calls: Array<{ cmd: string; args: readonly string[]; opts: RunOptions }>;
} {
  const calls: Array<{ cmd: string; args: readonly string[]; opts: RunOptions }> = [];

  const exec = async (
    cmd: string,
    args: readonly string[],
    opts: RunOptions = {},
  ): Promise<RunResult> => {
    calls.push({ cmd, args, opts });

    if (config.execError) {
      throw config.execError;
    }

    if (args.length === 1 && args[0] === '--version') {
      if (config.versionError) {
        throw config.versionError;
      }
      if (config.version === null) {
        return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false };
      }
      return {
        code: 0,
        signal: null,
        stdout: `${config.version ?? 'agy 1.2.3'}\n`,
        stderr: '',
        timedOut: false,
      };
    }

    if (config.writeAnswerFile !== undefined) {
      const prompt = args[1] ?? '';
      const match = prompt.match(/file (\/.*answer\.md)/);
      if (match?.[1]) {
        writeFileSync(match[1], config.writeAnswerFile);
      }
    }

    if (config.streamChunks) {
      for (const chunk of config.streamChunks) {
        opts.onStdout?.(chunk);
      }
    } else if (config.stdout !== undefined) {
      if (opts.captureStdout === false) {
        opts.onStdout?.(config.stdout);
      } else {
        opts.onStdout?.(config.stdout);
      }
    }

    return {
      code: config.code !== undefined ? config.code : 0,
      signal: null,
      stdout: opts.captureStdout === false ? '' : (config.stdout ?? ''),
      stderr: config.stderr ?? '',
      timedOut: config.timedOut ?? false,
    };
  };

  return { exec, calls };
}

describe('agy driver argv / version handling', () => {
  it('passes stream-json and sets captureStdout: false on version >= 1.2.3 (no-tools)', async () => {
    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: '' });

    await run(
      {
        prompt: 'do something',
        tools: false,
        timeoutSec: 60,
        cwd: '/test/cwd',
        backendModel: 'gemini-3.7-flash-high',
      },
      fake.exec,
    );

    expect(fake.calls.length).toBe(2);
    const runCall = fake.calls[1];
    expect(runCall).toBeDefined();
    if (runCall) {
      expect(runCall.cmd).toBe('agy');
      expect(runCall.args).toEqual([
        '-p',
        'do something',
        '--model',
        'gemini-3.7-flash-high',
        '--print-timeout',
        '60s',
        '--output-format',
        'stream-json',
      ]);
      expect(runCall.opts.captureStdout).toBe(false);
    }
  });

  it('keeps plain text args and captures stdout on version < 1.2.3 (1.2.2)', async () => {
    const fake = fakeAgy({ version: 'agy 1.2.2', stdout: 'Hello world' });

    const res = await run(
      {
        prompt: 'do something',
        tools: false,
        timeoutSec: 60,
        cwd: '/test/cwd',
        backendModel: 'gemini-3.7-flash-high',
      },
      fake.exec,
    );

    const runCall = fake.calls[1];
    expect(runCall).toBeDefined();
    if (runCall) {
      expect(runCall.args).toEqual([
        '-p',
        'do something',
        '--model',
        'gemini-3.7-flash-high',
        '--print-timeout',
        '60s',
      ]);
      expect(runCall.opts.captureStdout).toBeUndefined();
    }
    expect(res).toEqual({ ok: true, response: 'Hello world', exitCode: 0 });
  });

  it('falls back to text mode when version is unparseable', async () => {
    const fake = fakeAgy({ version: 'not-a-version', stdout: 'Text fallback' });

    const res = await run(
      {
        prompt: 'do something',
        tools: false,
        timeoutSec: 60,
        cwd: '/test/cwd',
        backendModel: 'gemini-3.7-flash-high',
      },
      fake.exec,
    );

    const runCall = fake.calls[1];
    expect(runCall).toBeDefined();
    if (runCall) {
      expect(runCall.args).not.toContain('--output-format');
    }
    expect(res).toEqual({ ok: true, response: 'Text fallback', exitCode: 0 });
  });

  it('passes --dangerously-skip-permissions, add-dirs, and stream-json on version 1.2.3 tools mode', async () => {
    const fake = fakeAgy({
      version: 'agy 1.2.3',
      writeAnswerFile: 'Written answer from file',
    });

    const res = await run(
      {
        prompt: 'do tool task',
        tools: true,
        timeoutSec: 100,
        cwd: '/repo/root',
        backendModel: 'gemini-3.7-flash-high',
      },
      fake.exec,
    );

    const runCall = fake.calls[1];
    expect(runCall).toBeDefined();
    if (runCall) {
      const firstAddDir = runCall.args.indexOf('--add-dir');
      const secondAddDir = runCall.args.indexOf('--add-dir', firstAddDir + 1);
      expect(runCall.args).toContain('--dangerously-skip-permissions');
      expect(firstAddDir).toBeGreaterThan(-1);
      expect(runCall.args[firstAddDir + 1]).toBe('/repo/root');
      expect(secondAddDir).toBeGreaterThan(firstAddDir);
      expect(runCall.args[secondAddDir + 1]).toMatch(/aibridge-agy-/);
      expect(runCall.args.slice(-2)).toEqual(['--output-format', 'stream-json']);
      expect(runCall.opts.captureStdout).toBe(false);
    }
    expect(res).toEqual({ ok: true, response: 'Written answer from file', exitCode: 0 });
  });
});

describe('agy no-tools stream-json parsing (1.2.3)', () => {
  const task = {
    prompt: 'test prompt',
    tools: false,
    timeoutSec: 30,
    cwd: '/work',
    backendModel: 'gemini-3.7-flash-high',
  };

  const stepUpdate = (
    stepType: string,
    delta?: string,
    state = 'ACTIVE',
    extra: Record<string, unknown> = {},
  ) =>
    JSON.stringify({
      event: 'step_update',
      step_update: {
        state,
        step_type: stepType,
        ...(delta !== undefined ? { text_delta: delta } : {}),
        ...extra,
      },
    });

  const resultFrame = (status: string, response?: string, error?: string) =>
    JSON.stringify({
      event: 'result',
      result: {
        status,
        ...(response !== undefined ? { response } : {}),
        ...(error !== undefined ? { error } : {}),
      },
    });

  it('parses init -> step_update deltas -> result SUCCESS', async () => {
    const log: string[] = [];
    const stream = [
      JSON.stringify({ event: 'init' }),
      stepUpdate('agent_response', 'Hel'),
      stepUpdate('agent_response', 'lo', 'DONE'),
      resultFrame('SUCCESS', 'Hello'),
      '',
    ].join('\n');

    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: stream });
    const res = await run({ ...task, onStdout: c => log.push(c) }, fake.exec);

    expect(res).toEqual({ ok: true, response: 'Hello', exitCode: 0 });
    expect(log.join('')).toBe('Hello\n');
    expect(log.join('')).not.toContain('event');
    expect(log.join('')).not.toContain('init');
  });

  it('triggers onActivity on mid-line chunks', async () => {
    let activityCount = 0;
    const stream = [
      JSON.stringify({ event: 'init' }),
      stepUpdate('agent_response', 'Hello', 'DONE'),
      resultFrame('SUCCESS', 'Hello'),
      '',
    ].join('\n');

    const fake = fakeAgy({
      version: 'agy 1.2.3',
      streamChunks: [stream.slice(0, 10), stream.slice(10, 25), stream.slice(25)],
    });

    const res = await run(
      {
        ...task,
        onActivity: () => {
          activityCount++;
        },
      },
      fake.exec,
    );

    expect(res).toEqual({ ok: true, response: 'Hello', exitCode: 0 });
    expect(activityCount).toBeGreaterThan(1);
  });

  it('maps protocol with empty SUCCESS response and no deltas to no-answer', async () => {
    const stream = [JSON.stringify({ event: 'init' }), resultFrame('SUCCESS', ''), ''].join('\n');

    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: stream });
    const res = await run(task, fake.exec);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('no-answer');
      expect(JSON.stringify(res)).not.toContain('event');
      expect(JSON.stringify(res)).not.toContain('step_update');
    }
  });

  it('prefers result.response over logged deltas when they differ', async () => {
    const log: string[] = [];
    const stream = [
      JSON.stringify({ event: 'init' }),
      stepUpdate('agent_response', 'draft\n', 'DONE'),
      resultFrame('SUCCESS', 'PASS'),
      '',
    ].join('\n');

    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: stream });
    const res = await run({ ...task, onStdout: c => log.push(c) }, fake.exec);

    expect(res).toEqual({ ok: true, response: 'PASS', exitCode: 0 });
    expect(log.join('')).toContain('draft\n');
    expect(log.join('')).toContain('PASS\n');
  });

  it('drops reasoning / thinking step_type from log and answer', async () => {
    const log: string[] = [];
    const stream = [
      JSON.stringify({ event: 'init' }),
      stepUpdate('reasoning', 'secret thinking'),
      stepUpdate('agent_response', 'PASS', 'DONE'),
      resultFrame('SUCCESS', 'PASS'),
      '',
    ].join('\n');

    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: stream });
    const res = await run({ ...task, onStdout: c => log.push(c) }, fake.exec);

    expect(res).toEqual({ ok: true, response: 'PASS', exitCode: 0 });
    expect(log.join('')).not.toContain('secret thinking');
    expect(log.join('')).toBe('PASS\n');
  });

  it('batches many tiny agent-response deltas (bounded onStdout calls)', async () => {
    let stdoutCallCount = 0;
    const chunks: string[] = [`${JSON.stringify({ event: 'init' })}\n`];
    for (let i = 0; i < 50; i++) {
      chunks.push(`${stepUpdate('agent_response', `part${i}`)}\n`);
    }
    chunks.push(`${stepUpdate('agent_response', '\n', 'DONE')}\n`);
    chunks.push(`${resultFrame('SUCCESS', 'all parts')}\n`);

    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: chunks.join('') });
    await run(
      {
        ...task,
        onStdout: () => {
          stdoutCallCount++;
        },
      },
      fake.exec,
    );

    // Should flush only when newline/DONE/result hit, far fewer than 50 calls
    expect(stdoutCallCount).toBeLessThan(10);
  });

  it('flushes an unterminated last NDJSON line', async () => {
    const log: string[] = [];
    const stream = `${JSON.stringify({ event: 'init' })}\n${resultFrame('SUCCESS', 'Done.')}`;

    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: stream });
    const res = await run({ ...task, onStdout: c => log.push(c) }, fake.exec);

    expect(res).toEqual({ ok: true, response: 'Done.', exitCode: 0 });
    expect(log.join('')).toBe('Done.\n');
  });

  it('passes non-protocol output through to log and uses as raw fallback', async () => {
    const log: string[] = [];
    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: 'not logged in\n', code: 1 });
    const res = await run({ ...task, onStdout: c => log.push(c) }, fake.exec);

    expect(res.ok).toBe(false);
    expect(log.join('')).toBe('not logged in\n');
    if (!res.ok) {
      expect(res.kind).toBe('no-answer');
      expect(JSON.stringify(res)).not.toContain('event');
    }
  });

  it('strips ANSI prefixes before classifying result frame', async () => {
    const stream = `\x1b[33m${resultFrame('SUCCESS', 'ANSI_OK')}\x1b[0m\n`;
    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: stream });
    const res = await run(task, fake.exec);

    expect(res).toEqual({ ok: true, response: 'ANSI_OK', exitCode: 0 });
  });

  it('returns explicit no-answer when pre-protocol raw output exceeds 8192 chars', async () => {
    const longRaw = `${'A'.repeat(5000)}\n${'B'.repeat(4000)}\n`;
    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: longRaw });
    const res = await run(task, fake.exec);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('no-answer');
      expect(res.message).toContain(
        'returned more than 8192 characters without a recognized stream protocol',
      );
    }
  });

  it('valid result wins even after a long raw preamble > 8192 chars', async () => {
    const longRawWithResult = [
      'A'.repeat(5000),
      'B'.repeat(4000),
      resultFrame('SUCCESS', 'VALID_RESULT'),
      '',
    ].join('\n');
    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: longRawWithResult });
    const res = await run(task, fake.exec);

    expect(res).toEqual({ ok: true, response: 'VALID_RESULT', exitCode: 0 });
  });
});

describe('agy tools stream-json parsing', () => {
  const task = {
    prompt: 'tool task',
    tools: true,
    timeoutSec: 30,
    cwd: '/work',
    backendModel: 'gemini-3.7-flash-high',
  };

  it('authoritative answer file wins over result.response and emits banner', async () => {
    const log: string[] = [];
    const stream = [
      JSON.stringify({ event: 'init' }),
      JSON.stringify({
        event: 'result',
        result: { status: 'SUCCESS', response: 'something else' },
      }),
      '',
    ].join('\n');

    const fake = fakeAgy({
      version: 'agy 1.2.3',
      stdout: stream,
      writeAnswerFile: 'Written answer from file',
    });

    const res = await run({ ...task, onStdout: c => log.push(c) }, fake.exec);

    expect(res).toEqual({ ok: true, response: 'Written answer from file', exitCode: 0 });
    expect(log.join('')).toContain('--- final answer ---\nWritten answer from file\n');
  });

  it('returns result.response when no answer file is created in tools mode', async () => {
    const stream = [
      JSON.stringify({ event: 'init' }),
      JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'from stream' } }),
      '',
    ].join('\n');

    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: stream });
    const res = await run(task, fake.exec);

    expect(res).toEqual({ ok: true, response: 'from stream', exitCode: 0 });
  });

  it('logs tool ACTIVE and DONE concisely without dumping heavy payloads', async () => {
    const log: string[] = [];
    const stream = [
      JSON.stringify({ event: 'init' }),
      JSON.stringify({
        event: 'step_update',
        step_update: {
          state: 'ACTIVE',
          tool_name: 'read_file',
          tool_info: { output: '10k'.repeat(5000) },
        },
      }),
      JSON.stringify({
        event: 'step_update',
        step_update: {
          state: 'DONE',
          tool_name: 'read_file',
          tool_info: { summary: 'read 100 lines from foo.ts', output: 'huge payload' },
        },
      }),
      JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'done' } }),
      '',
    ].join('\n');

    const fake = fakeAgy({ version: 'agy 1.2.3', stdout: stream });
    const res = await run({ ...task, onStdout: c => log.push(c) }, fake.exec);

    expect(res).toEqual({ ok: true, response: 'done', exitCode: 0 });
    const logStr = log.join('');
    expect(logStr).toContain('tool read_file\n');
    expect(logStr).toContain('tool read_file done: read 100 lines from foo.ts\n');
    expect(logStr).not.toContain('huge payload');
    expect(logStr).not.toContain('10k10k');
  });
});

describe('agy timeout and error handling', () => {
  const task = {
    prompt: 'test prompt',
    tools: false,
    timeoutSec: 1,
    cwd: '/work',
    backendModel: 'gemini-3.7-flash-high',
  };

  it('maps soft print-timeout stderr on stream path to timeout with ~1s message', async () => {
    const stderr = '[agy] print timeout after 1s with turn in progress; returning partial output\n';
    const stream = [
      JSON.stringify({ event: 'init' }),
      JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'partial' } }),
      '',
    ].join('\n');

    const fake = fakeAgy({
      version: 'agy 1.2.3',
      stdout: stream,
      stderr,
      code: 0,
    });

    const res = await run(task, fake.exec);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('timeout');
      expect(res.message).toBe('aibridge: agy timed out after ~1s; raise --timeout.');
    }
  });

  it('maps soft print-timeout stderr on 1.2.2 text path to timeout', async () => {
    const stderr = '[agy] print timeout after 1s with turn in progress; returning partial output\n';
    const fake = fakeAgy({
      version: 'agy 1.2.2',
      stdout: 'partial',
      stderr,
      code: 0,
    });

    const res = await run(task, fake.exec);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('timeout');
      expect(res.message).toBe('aibridge: agy timed out after ~1s; raise --timeout.');
    }
  });

  it('answer file wins over soft print-timeout stderr in tools mode', async () => {
    const stderr = '[agy] print timeout after 1s with turn in progress; returning partial output\n';
    const fake = fakeAgy({
      version: 'agy 1.2.3',
      stderr,
      code: 0,
      writeAnswerFile: 'Full finished answer',
    });

    const res = await run({ ...task, tools: true }, fake.exec);

    expect(res).toEqual({ ok: true, response: 'Full finished answer', exitCode: 0 });
  });

  it('ERROR result frame overrides a non-empty answer file even with exit 0', async () => {
    const stream = [
      JSON.stringify({ event: 'init' }),
      JSON.stringify({
        event: 'result',
        result: { status: 'ERROR', response: '', error: 'provider failed after writing file' },
      }),
      '',
    ].join('\n');
    const fake = fakeAgy({
      version: 'agy 1.2.3',
      stdout: stream,
      code: 0,
      writeAnswerFile: 'Apparently finished answer',
    });

    const res = await run({ ...task, tools: true }, fake.exec);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('no-answer');
      expect(res.message).toContain('provider failed after writing file');
    }
  });

  it('does not trigger soft timeout if stderr does not match exact terminal [agy] line or code != 0', async () => {
    const stderr =
      'mid-stream [agy] print timeout after 1s with turn in progress; returning partial output\nsome other error\n';
    const stream = [
      JSON.stringify({ event: 'init' }),
      JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'ok answer' } }),
      '',
    ].join('\n');

    const fake = fakeAgy({
      version: 'agy 1.2.3',
      stdout: stream,
      stderr,
      code: 0,
    });

    const res = await run(task, fake.exec);
    expect(res).toEqual({ ok: true, response: 'ok answer', exitCode: 0 });
  });

  it('maps hard process timedOut to timeout with ~21s message', async () => {
    const fake = fakeAgy({
      version: 'agy 1.2.3',
      timedOut: true,
      code: null,
    });

    const res = await run(task, fake.exec);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('timeout');
      expect(res.message).toBe('aibridge: agy timed out after ~21s; raise --timeout.');
    }
  });

  it('hard process timeout wins over a non-empty answer file', async () => {
    const fake = fakeAgy({
      version: 'agy 1.2.3',
      timedOut: true,
      code: null,
      writeAnswerFile: 'Possibly torn answer',
    });

    const res = await run({ ...task, tools: true }, fake.exec);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('timeout');
      expect(res.message).toBe('aibridge: agy timed out after ~21s; raise --timeout.');
    }
  });

  it('maps exit 1, error stderr, and ERROR frame to no-answer with detail', async () => {
    const stderr = 'error: unknown model foo\n';
    const stream = [
      JSON.stringify({ event: 'init' }),
      JSON.stringify({ event: 'result', result: { status: 'ERROR', error: 'unknown model foo' } }),
      '',
    ].join('\n');

    const fake = fakeAgy({
      version: 'agy 1.2.3',
      stdout: stream,
      stderr,
      code: 1,
    });

    const res = await run(task, fake.exec);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('no-answer');
      expect(res.message).toContain('unknown model foo');
      expect(JSON.stringify(res)).not.toContain('event');
    }
  });

  it('maps empty SUCCESS with exit 0 and no print-timeout stderr to no-answer (quota death)', async () => {
    const stream = [
      JSON.stringify({ event: 'init' }),
      JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: '' } }),
      '',
    ].join('\n');

    const fake = fakeAgy({
      version: 'agy 1.2.3',
      stdout: stream,
      code: 0,
    });

    const res = await run(task, fake.exec);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('no-answer');
    }
  });
});

describe('agy spawn failure handling', () => {
  const task = {
    prompt: 'test',
    tools: false,
    timeoutSec: 10,
    cwd: '/work',
    backendModel: 'gemini-3.7-flash-high',
  };

  it('maps ENOENT spawn error to not-found', async () => {
    const err = new Error('spawn agy ENOENT') as Error & { code?: string };
    err.code = 'ENOENT';
    const fake = fakeAgy({ execError: err });

    const res = await run(task, fake.exec);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('not-found');
      expect(res.exitCode).toBeNull();
    }
  });

  it('maps version probe EACCES rejection to kind: spawn without escaping', async () => {
    const err = new Error('spawn agy EACCES') as Error & { code?: string };
    err.code = 'EACCES';
    const fake = fakeAgy({ versionError: err });

    const res = await run(task, fake.exec);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('spawn');
      expect(res.message).toContain('EACCES');
      expect(res.exitCode).toBeNull();
    }
  });
});
