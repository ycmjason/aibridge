import { isNotFound, type RunResult, runCaptured, stripAnsi } from '@aibridge/proc';
import { buildGrokPrintArgs, grokEnv } from './grok.ts';

export interface DelegationTask {
  readonly prompt: string;
  readonly tools: boolean;
  readonly timeoutSec: number;
  readonly cwd: string;
  readonly backendModel: string;
  readonly effort?: string | undefined;
  readonly onStdout?: (chunk: string) => void;
  readonly onStderr?: (chunk: string) => void;
  readonly onSpawn?: (pid: number) => void;
}

export type DelegationResult =
  | { readonly ok: true; readonly response: string; readonly exitCode: number }
  | {
      readonly ok: false;
      readonly kind: 'not-found' | 'spawn' | 'timeout' | 'no-answer';
      readonly message: string;
      readonly exitCode: number | null;
    };

const NOISE_RE = /^Shell cwd was reset[^\n]*$/gm;
const INSTALL_HINT = 'Install the Grok CLI (npm i -g @xai-official/grok) and run `grok login`.';

/**
 * grok's `plain` and `json` output concatenate every assistant turn into one
 * blob, gluing the final answer straight onto the tail of the narration before
 * it — `...I'll write the review report now.PASS`, no separator. That silently
 * broke `review`, whose stdout contract needs the verdict alone on a line, and
 * it prefixes every delegation's answer with the model thinking out loud.
 * `streaming-messages-json` is the only format that keeps the turns apart, so
 * the driver reads the answer off the frames and callers get just the answer:
 * a non-empty terminal `result.result` first (grok documents it as the final
 * assistant message text), the last non-empty assistant `text` as the backstop,
 * and raw stdout only when grok never spoke the protocol at all.
 */
const MESSAGE_STREAM_ARGS = ['--output-format', 'streaming-messages-json'];

function clean(s: string): string {
  return stripAnsi(s).replace(NOISE_RE, '').trim();
}

type StreamLine =
  /** The terminal frame. Grok's docs call its `result` the final answer text. */
  | { readonly kind: 'result'; readonly text: string }
  /** An assistant turn — only its `text` blocks are answer material. */
  | { readonly kind: 'assistant'; readonly text: string }
  /** A well-formed frame carrying no answer text (system/init, user). */
  | { readonly kind: 'frame' }
  /** Anything grok printed outside the protocol, e.g. a sign-in refusal. */
  | { readonly kind: 'raw' }
  | { readonly kind: 'blank' };

function classifyLine(line: string): StreamLine {
  const trimmed = line.trim();
  if (trimmed.length === 0) return { kind: 'blank' };
  if (!trimmed.startsWith('{')) return { kind: 'raw' };

  let frame: { type?: unknown; result?: unknown; message?: { role?: string; content?: unknown } };
  try {
    frame = JSON.parse(trimmed) as typeof frame;
  } catch {
    return { kind: 'raw' };
  }

  if (frame.type === 'result') {
    return typeof frame.result === 'string'
      ? { kind: 'result', text: frame.result }
      : { kind: 'frame' };
  }

  const message = frame.message;
  if (message?.role !== 'assistant' || !Array.isArray(message.content)) return { kind: 'frame' };

  let text = '';
  for (const block of message.content) {
    if (typeof block !== 'object' || block === null) continue;
    const { type, text: blockText } = block as { type?: unknown; text?: unknown };
    if (type === 'text' && typeof blockText === 'string') text += blockText;
  }
  return { kind: 'assistant', text };
}

interface StreamAnswer {
  /** The answer, or null when the stream carried no answer text at all. */
  readonly text: string | null;
  /** True once any protocol frame was seen, so raw stdout is NOT the answer. */
  readonly sawProtocol: boolean;
}

/**
 * Prefer the terminal `result` frame — grok documents its `result` field as the
 * final assistant message text. The last assistant turn is the backstop for a
 * stream that ends without one.
 */
function readAnswer(stdout: string): StreamAnswer {
  let terminal: string | null = null;
  let lastAssistant: string | null = null;
  let sawProtocol = false;

  for (const line of stripAnsi(stdout).split('\n')) {
    const classified = classifyLine(line);
    if (classified.kind === 'raw' || classified.kind === 'blank') continue;
    sawProtocol = true;
    if (classified.kind === 'result' && classified.text.trim().length > 0) {
      terminal = classified.text;
    } else if (classified.kind === 'assistant' && classified.text.trim().length > 0) {
      lastAssistant = classified.text;
    }
  }
  return { text: terminal ?? lastAssistant, sawProtocol };
}

interface LogForwarder {
  readonly onChunk: ((chunk: string) => void) | undefined;
  /** Emit a trailing line the child left unterminated, so the log loses nothing. */
  readonly flush: () => void;
}

/**
 * Keep the run log prose rather than NDJSON: unwrap assistant turns, drop
 * protocol frames, and pass anything unrecognised through so a failure grok
 * prints outside the protocol still reaches the log.
 */
function logForwarder(onStdout: ((chunk: string) => void) | undefined): LogForwarder {
  if (!onStdout) return { onChunk: undefined, flush: () => {} };

  let pending = '';
  let lastForwarded = '';
  const emit = (line: string): void => {
    const classified = classifyLine(line);
    if (classified.kind === 'assistant') {
      if (classified.text.trim().length > 0) {
        lastForwarded = classified.text;
        onStdout(`${classified.text}\n`);
      }
    } else if (classified.kind === 'result') {
      // The log has to mirror the answer policy, or a contentless response —
      // no assistant frame at all, answer only in `result.result` — logs
      // everything except the answer. Skip the usual case where the terminal
      // frame just repeats the assistant turn already written.
      if (classified.text.trim().length > 0 && classified.text !== lastForwarded) {
        onStdout(`${classified.text}\n`);
      }
    } else if (classified.kind === 'raw') {
      onStdout(`${line}\n`);
    }
  };

  return {
    onChunk: (chunk: string): void => {
      pending += chunk;
      for (let nl = pending.indexOf('\n'); nl !== -1; nl = pending.indexOf('\n')) {
        emit(pending.slice(0, nl));
        pending = pending.slice(nl + 1);
      }
    },
    flush: (): void => {
      if (pending.length === 0) return;
      const line = pending;
      pending = '';
      emit(line);
    },
  };
}

export async function run(
  task: DelegationTask,
  exec: typeof runCaptured = runCaptured,
): Promise<DelegationResult> {
  const args = [
    ...buildGrokPrintArgs(task.prompt, {
      model: task.backendModel,
      effort: task.effort,
      skipPermissions: task.tools,
    }),
    ...MESSAGE_STREAM_ARGS,
  ];

  const forwarder = logForwarder(task.onStdout);

  try {
    let result: RunResult;
    try {
      result = await exec('grok', args, {
        cwd: task.cwd,
        timeoutMs: (task.timeoutSec + 20) * 1000,
        env: grokEnv(),
        onStdout: forwarder.onChunk,
        onStderr: task.onStderr,
        onSpawn: task.onSpawn,
      });
    } catch (err) {
      if (isNotFound(err)) {
        return {
          ok: false,
          kind: 'not-found',
          message: `aibridge: "grok" not found on PATH. ${INSTALL_HINT}`,
          exitCode: null,
        };
      }
      return {
        ok: false,
        kind: 'spawn',
        message: `aibridge: failed to run grok: ${(err as Error).message}`,
        exitCode: null,
      };
    }

    forwarder.flush();

    if (result.timedOut) {
      return {
        ok: false,
        kind: 'timeout',
        message: `aibridge: grok timed out after ~${task.timeoutSec + 20}s; raise --timeout.`,
        exitCode: result.code,
      };
    }

    // Raw stdout is the answer ONLY when grok never spoke the protocol — a
    // refusal before the stream opens (not signed in, bad flag) still has to
    // reach the sign-in check below. Once any frame is seen, a stream carrying
    // no answer text is an EMPTY answer, never the NDJSON dump: handing callers
    // the protocol itself is the exact failure this format switch exists to stop.
    const answer = readAnswer(result.stdout);
    const response = clean(answer.text ?? (answer.sawProtocol ? '' : result.stdout));

    // Only a terse one-liner is the CLI's own sign-in notice; a long answer that
    // merely mentions the phrase is a real answer about auth.
    if (response.length < 300 && /not authenticated|please (?:run )?`?grok login/i.test(response)) {
      return {
        ok: false,
        kind: 'no-answer',
        message: 'aibridge: grok is not signed in. Run `grok login`, then retry.',
        exitCode: result.code,
      };
    }

    if (result.code !== 0 || response.length === 0) {
      const detail = clean(result.stderr) || `exit code ${result.code}`;
      return {
        ok: false,
        kind: 'no-answer',
        message: `aibridge: grok returned no usable answer (${detail}).`,
        exitCode: result.code,
      };
    }

    return { ok: true, response, exitCode: result.code ?? 0 };
  } catch (err) {
    return {
      ok: false,
      kind: 'spawn',
      message: `aibridge: error executing grok: ${(err as Error).message}`,
      exitCode: null,
    };
  }
}
