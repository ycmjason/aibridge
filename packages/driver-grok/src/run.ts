import { isNotFound, type RunResult, runCaptured, stripAnsi } from '@aibridge/proc';
import { buildGrokPrintArgs } from './grok.ts';

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

function clean(s: string): string {
  return stripAnsi(s).replace(NOISE_RE, '').trim();
}

export async function run(
  task: DelegationTask,
  exec: typeof runCaptured = runCaptured,
): Promise<DelegationResult> {
  const args = buildGrokPrintArgs(task.prompt, {
    model: task.backendModel,
    effort: task.effort,
    skipPermissions: task.tools,
  });

  try {
    let result: RunResult;
    try {
      result = await exec('grok', args, {
        cwd: task.cwd,
        timeoutMs: (task.timeoutSec + 20) * 1000,
        onStdout: task.onStdout,
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

    if (result.timedOut) {
      return {
        ok: false,
        kind: 'timeout',
        message: `aibridge: grok timed out after ~${task.timeoutSec + 20}s; raise --timeout.`,
        exitCode: result.code,
      };
    }

    const response = clean(result.stdout);

    if (/not authenticated|please (?:run )?`?grok login/i.test(response)) {
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
