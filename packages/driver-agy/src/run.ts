import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isNotFound, probeVersion, type RunResult, runCaptured, stripAnsi } from '@aibridge/proc';
import { agySupportsStreamJson, buildAgyPrintArgs } from './agy.ts';
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
const MESSAGE_STREAM_ARGS = ['--output-format', 'stream-json'] as const;
const RAW_FALLBACK_MAX_CHARS = 8192;
const READABLE_LOG_FLUSH_CHARS = 4096;
const AGY_PRINT_TIMEOUT_RE =
  /^\[agy\] print timeout after \S+ with turn in progress; returning partial output\s*$/i;
const TOOL_SUMMARY_MAX = 200;

function clean(s: string): string {
  return stripAnsi(s).replace(NOISE_RE, '').trim();
}

type StreamLine =
  | { readonly kind: 'init' }
  | {
      readonly kind: 'step';
      readonly state: string | undefined;
      readonly stepType: string | undefined;
      readonly textDelta: string | undefined;
      readonly toolName: string | undefined;
      readonly toolInfo: unknown;
    }
  | {
      readonly kind: 'result';
      readonly status: string | undefined;
      readonly response: string | undefined;
      readonly error: string | undefined;
    }
  | { readonly kind: 'frame' }
  | { readonly kind: 'raw'; readonly line: string }
  | { readonly kind: 'blank' };

function classifyLine(line: string): StreamLine {
  const trimmed = line.trim();
  if (trimmed.length === 0) return { kind: 'blank' };
  if (!trimmed.startsWith('{')) return { kind: 'raw', line };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: 'raw', line };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('event' in parsed) ||
    typeof (parsed as { event?: unknown }).event !== 'string'
  ) {
    return { kind: 'raw', line };
  }

  const event = (parsed as { event: string }).event;
  if (event === 'init') {
    return { kind: 'init' };
  }

  if (event === 'step_update') {
    const stepUpdate = (parsed as { step_update?: unknown }).step_update;
    if (typeof stepUpdate === 'object' && stepUpdate !== null) {
      const su = stepUpdate as {
        state?: unknown;
        step_type?: unknown;
        text_delta?: unknown;
        tool_name?: unknown;
        tool_info?: unknown;
      };
      return {
        kind: 'step',
        state: typeof su.state === 'string' ? su.state : undefined,
        stepType: typeof su.step_type === 'string' ? su.step_type : undefined,
        textDelta: typeof su.text_delta === 'string' ? su.text_delta : undefined,
        toolName: typeof su.tool_name === 'string' ? su.tool_name : undefined,
        toolInfo: su.tool_info,
      };
    }
    return {
      kind: 'step',
      state: undefined,
      stepType: undefined,
      textDelta: undefined,
      toolName: undefined,
      toolInfo: undefined,
    };
  }

  if (event === 'result') {
    const res = (parsed as { result?: unknown }).result;
    if (typeof res === 'object' && res !== null) {
      const r = res as { status?: unknown; response?: unknown; error?: unknown };
      return {
        kind: 'result',
        status: typeof r.status === 'string' ? r.status : undefined,
        response: typeof r.response === 'string' ? r.response : undefined,
        error: typeof r.error === 'string' ? r.error : undefined,
      };
    }
    return {
      kind: 'result',
      status: undefined,
      response: undefined,
      error: undefined,
    };
  }

  return { kind: 'frame' };
}

function formatToolSummary(toolInfo: unknown): string | null {
  if (typeof toolInfo !== 'object' || toolInfo === null) return null;
  const obj = toolInfo as Record<string, unknown>;
  const raw =
    typeof obj.summary === 'string'
      ? obj.summary
      : typeof obj.message === 'string'
        ? obj.message
        : null;
  if (!raw) return null;
  const firstLine = raw.split('\n')[0]?.trim();
  if (!firstLine) return null;
  return firstLine.slice(0, TOOL_SUMMARY_MAX);
}

interface StreamSnapshot {
  readonly sawProtocol: boolean;
  readonly text: string | null;
  readonly resultStatus: string | null;
  readonly resultError: string | null;
  readonly rawFallback: string;
  readonly rawTruncated: boolean;
}

interface LogForwarder {
  readonly onChunk: (chunk: string) => void;
  readonly flush: () => void;
  readonly snapshot: () => StreamSnapshot;
}

function logForwarder(
  onStdout: ((chunk: string) => void) | undefined,
  onActivity: (() => void) | undefined,
): LogForwarder {
  let pending = '';
  let readableBuffer = '';
  let loggedAgentText = '';
  let sawProtocol = false;
  let resultStatus: string | null = null;
  let resultResponse: string | null = null;
  let resultError: string | null = null;
  let rawFallback = '';
  let rawTruncated = false;

  const flushReadable = (): void => {
    if (readableBuffer.length === 0) return;
    const toSend = readableBuffer.endsWith('\n') ? readableBuffer : `${readableBuffer}\n`;
    readableBuffer = '';
    onStdout?.(toSend);
  };

  const emit = (rawLine: string): void => {
    const line = stripAnsi(rawLine);
    const classified = classifyLine(line);

    if (classified.kind === 'blank') {
      return;
    }

    if (classified.kind === 'init' || classified.kind === 'frame') {
      sawProtocol = true;
      return;
    }

    if (classified.kind === 'step') {
      sawProtocol = true;
      if (classified.stepType === 'agent_response' && classified.textDelta) {
        loggedAgentText += classified.textDelta;
        readableBuffer += classified.textDelta;
        if (readableBuffer.includes('\n') || readableBuffer.length >= READABLE_LOG_FLUSH_CHARS) {
          flushReadable();
        }
      }

      if (classified.state === 'DONE' && classified.stepType === 'agent_response') {
        if (readableBuffer.length > 0 && !readableBuffer.endsWith('\n')) {
          readableBuffer += '\n';
        }
        flushReadable();
      }

      if (classified.toolName) {
        flushReadable();
        if (classified.state === 'ACTIVE') {
          onStdout?.(`tool ${classified.toolName}\n`);
        } else if (classified.state === 'DONE') {
          const summary = formatToolSummary(classified.toolInfo);
          if (summary) {
            onStdout?.(`tool ${classified.toolName} done: ${summary}\n`);
          } else {
            onStdout?.(`tool ${classified.toolName} done\n`);
          }
        }
      }
      return;
    }

    if (classified.kind === 'result') {
      sawProtocol = true;
      resultStatus = classified.status ?? null;
      resultResponse = classified.response ?? null;
      resultError = classified.error ?? null;

      flushReadable();

      if (classified.response && classified.response.length > 0) {
        const cleanResp = clean(classified.response);
        const cleanLogged = clean(loggedAgentText);
        if (cleanResp.length > 0 && !cleanLogged.endsWith(cleanResp)) {
          readableBuffer += classified.response;
          flushReadable();
        }
      }
      return;
    }

    if (classified.kind === 'raw') {
      flushReadable();
      onStdout?.(`${rawLine}\n`);
      if (!sawProtocol) {
        if (!rawTruncated) {
          const candidate = `${rawLine}\n`;
          if (rawFallback.length + candidate.length > RAW_FALLBACK_MAX_CHARS) {
            rawTruncated = true;
          } else {
            rawFallback += candidate;
          }
        }
      }
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
      if (pending.length > 0) {
        const line = pending;
        pending = '';
        emit(line);
      }
      flushReadable();
    },
    snapshot: (): StreamSnapshot => ({
      sawProtocol,
      text: resultResponse && resultResponse.length > 0 ? resultResponse : null,
      resultStatus,
      resultError,
      rawFallback,
      rawTruncated,
    }),
  };
}

export async function run(
  task: DelegationTask,
  exec: typeof runCaptured = runCaptured,
): Promise<DelegationResult> {
  let tempDir: string | undefined;
  let answerPath: string | undefined;

  let taskPrompt = task.prompt;
  const addDirs: string[] = [];

  if (task.tools) {
    tempDir = mkdtempSync(join(tmpdir(), 'aibridge-agy-'));
    answerPath = join(tempDir, 'answer.md');
    taskPrompt =
      `${task.prompt}\n\nYou are working in the repository rooted at ${task.cwd}; make ALL file ` +
      `edits there (any relative paths in the task are relative to that root). When the task ` +
      `is complete, write ONLY your final answer (the exact text you would otherwise print as ` +
      `your response, with no narration of your steps) to the file ${answerPath} — nothing else ` +
      `in that file. This is how your answer is captured; do not mention the file in the answer.`;
    addDirs.push(task.cwd, tempDir);
  }

  try {
    let result: RunResult;
    let useStreamJson = false;
    let forwarder: LogForwarder | undefined;

    try {
      const version = await probeVersion('agy', exec);
      useStreamJson = agySupportsStreamJson(version);
      if (!useStreamJson) {
        task.onStderr?.(
          `aibridge: agy version ${version ?? 'unavailable'} does not support stream-json (requires >= 1.2.3); using text compatibility mode.\n`,
        );
      }

      const args = [
        ...buildAgyPrintArgs(taskPrompt, {
          model: task.backendModel,
          printTimeoutSec: task.timeoutSec,
          skipPermissions: task.tools,
          addDirs: addDirs.length > 0 ? addDirs : undefined,
        }),
        ...(useStreamJson ? MESSAGE_STREAM_ARGS : []),
      ];

      if (useStreamJson) {
        forwarder = logForwarder(task.onStdout, task.onActivity);
        result = await exec('agy', args, {
          cwd: task.cwd,
          timeoutMs: (task.timeoutSec + 20) * 1000,
          captureStdout: false,
          onStdout: forwarder.onChunk,
          onStderr: task.onStderr,
          onSpawn: task.onSpawn,
        });
      } else {
        result = await exec('agy', args, {
          cwd: task.cwd,
          timeoutMs: (task.timeoutSec + 20) * 1000,
          onStdout: chunk => {
            task.onActivity?.();
            task.onStdout?.(chunk);
          },
          onStderr: task.onStderr,
          onSpawn: task.onSpawn,
        });
      }
    } catch (err) {
      if (isNotFound(err)) {
        return {
          ok: false,
          kind: 'not-found',
          message: `aibridge: "agy" not found on PATH. ${INSTALL_HINT}`,
          exitCode: null,
        };
      }
      return {
        ok: false,
        kind: 'spawn',
        message: `aibridge: failed to run agy: ${(err as Error).message}`,
        exitCode: null,
      };
    }

    forwarder?.flush();

    if (result.timedOut) {
      return {
        ok: false,
        kind: 'timeout',
        message: `aibridge: agy timed out after ~${task.timeoutSec + 20}s; raise --timeout.`,
        exitCode: result.code,
      };
    }

    let fileAnswer = '';
    if (answerPath && existsSync(answerPath)) {
      fileAnswer = clean(readFileSync(answerPath, 'utf8'));
      if (fileAnswer.length > 0) {
        task.onStdout?.(`\n--- final answer ---\n${fileAnswer}\n`);
      }
    }

    const snap = useStreamJson && forwarder ? forwarder.snapshot() : undefined;
    let resolvedAnswer = '';
    const sawProtocol = snap?.sawProtocol ?? false;
    const rawTruncated = snap?.rawTruncated ?? false;
    const resultError = snap?.resultError ?? null;
    const resultStatus = snap?.resultStatus ?? null;

    if (fileAnswer.length > 0) {
      resolvedAnswer = fileAnswer;
    } else {
      const stderrLines = stripAnsi(result.stderr)
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);
      const lastStderrLine = stderrLines[stderrLines.length - 1] ?? '';
      if (result.code === 0 && AGY_PRINT_TIMEOUT_RE.test(lastStderrLine)) {
        return {
          ok: false,
          kind: 'timeout',
          message: `aibridge: agy timed out after ~${task.timeoutSec}s; raise --timeout.`,
          exitCode: result.code,
        };
      }

      if (snap) {
        resolvedAnswer = clean(
          snap.text ?? (snap.sawProtocol || snap.rawTruncated ? '' : snap.rawFallback),
        );
      } else {
        resolvedAnswer = clean(result.stdout);
      }
    }

    if (useStreamJson && !sawProtocol && rawTruncated && resolvedAnswer.length === 0) {
      return {
        ok: false,
        kind: 'no-answer',
        message: `aibridge: agy returned more than ${RAW_FALLBACK_MAX_CHARS} characters without a recognized stream protocol; see the run log.`,
        exitCode: result.code,
      };
    }

    if (resultStatus === 'ERROR' || result.code !== 0 || resolvedAnswer.length === 0) {
      const detail = clean(resultError || result.stderr) || `exit code ${result.code}`;
      return {
        ok: false,
        kind: 'no-answer',
        message: `aibridge: agy returned no usable answer (${detail}).`,
        exitCode: result.code,
      };
    }

    return { ok: true, response: resolvedAnswer, exitCode: result.code ?? 0 };
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}
