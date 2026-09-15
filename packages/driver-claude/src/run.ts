import { isNotFound, type RunResult, runCaptured, stripAnsi } from '@aibridge/proc';
import { buildClaudePrintArgs } from './claude.ts';
import { INSTALL_HINT } from './probe.ts';

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
  readonly onActivity?: () => void;
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

const MESSAGE_STREAM_ARGS = [
  '--output-format',
  'stream-json',
  '--verbose',
  '--include-partial-messages',
];

function clean(s: string): string {
  return stripAnsi(s).replace(NOISE_RE, '').trim();
}

type StreamLine =
  /** The terminal frame with string `result`. */
  | { readonly kind: 'result'; readonly text: string }
  /** An assistant turn — only its `text` blocks are answer material. */
  | { readonly kind: 'assistant'; readonly text: string }
  /** A partial message event or delta. */
  | { readonly kind: 'stream_event' }
  /** A well-formed frame carrying no answer text (system/init, user). */
  | { readonly kind: 'frame' }
  /** Anything claude printed outside the protocol. */
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

  if (
    frame.type === 'stream_event' ||
    (typeof frame.type === 'string' && frame.type.endsWith('_delta'))
  ) {
    return { kind: 'stream_event' };
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
  readonly onChunk: (chunk: string) => void;
  /** Emit a trailing line the child left unterminated, so the log loses nothing. */
  readonly flush: () => void;
}

function logForwarder(
  onStdout: ((chunk: string) => void) | undefined,
  onActivity: (() => void) | undefined,
): LogForwarder {
  let pending = '';
  let lastForwarded = '';
  const emit = (line: string): void => {
    const classified = classifyLine(line);
    if (classified.kind === 'assistant') {
      if (classified.text.trim().length > 0) {
        lastForwarded = classified.text;
        onStdout?.(`${classified.text}\n`);
      }
    } else if (classified.kind === 'result') {
      if (classified.text.trim().length > 0 && classified.text !== lastForwarded) {
        onStdout?.(`${classified.text}\n`);
      }
    } else if (classified.kind === 'raw') {
      onStdout?.(`${line}\n`);
    }
  };

  return {
    onChunk: (chunk: string): void => {
      onActivity?.();
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
    ...buildClaudePrintArgs(task.prompt, {
      model: task.backendModel,
      effort: task.effort,
      skipPermissions: task.tools,
    }),
    ...MESSAGE_STREAM_ARGS,
  ];

  const forwarder = logForwarder(task.onStdout, task.onActivity);

  try {
    let result: RunResult;
    try {
      result = await exec('claude', args, {
        cwd: task.cwd,
        timeoutMs: (task.timeoutSec + 20) * 1000,
        onStdout: forwarder.onChunk,
        onStderr: task.onStderr,
        onSpawn: task.onSpawn,
      });
    } catch (err) {
      if (isNotFound(err)) {
        return {
          ok: false,
          kind: 'not-found',
          message: `aibridge: "claude" not found on PATH. ${INSTALL_HINT}`,
          exitCode: null,
        };
      }
      return {
        ok: false,
        kind: 'spawn',
        message: `aibridge: failed to run claude: ${(err as Error).message}`,
        exitCode: null,
      };
    }

    forwarder.flush();

    if (result.timedOut) {
      return {
        ok: false,
        kind: 'timeout',
        message: `aibridge: claude timed out after ~${task.timeoutSec + 20}s; raise --timeout.`,
        exitCode: result.code,
      };
    }

    const answer = readAnswer(result.stdout);
    const response = clean(answer.text ?? (answer.sawProtocol ? '' : result.stdout));

    if (result.code !== 0 || response.length === 0) {
      const detail = clean(result.stderr) || `exit code ${result.code}`;
      return {
        ok: false,
        kind: 'no-answer',
        message: `aibridge: claude returned no usable answer (${detail}).`,
        exitCode: result.code,
      };
    }

    return { ok: true, response, exitCode: result.code ?? 0 };
  } catch (err) {
    return {
      ok: false,
      kind: 'spawn',
      message: `aibridge: error executing claude: ${(err as Error).message}`,
      exitCode: null,
    };
  }
}
