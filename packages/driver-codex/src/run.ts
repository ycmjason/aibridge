import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isNotFound, type RunResult, runCaptured, stripAnsi } from '@aibridge/proc';
import { buildCodexExecArgs, ensureCodex, MIN_CODEX_STRUCTURED } from './codex.ts';

export interface DelegationTask {
  readonly prompt: string;
  readonly tools: boolean;
  readonly timeoutSec: number;
  readonly cwd: string;
  readonly backendModel: string | undefined;
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
const INSTALL_HINT = 'Install the Codex CLI and sign in to ChatGPT.';

function clean(s: string): string {
  return stripAnsi(s).replace(NOISE_RE, '').trim();
}

export async function run(
  task: DelegationTask,
  exec: typeof runCaptured = runCaptured,
): Promise<DelegationResult> {
  const check = await ensureCodex(MIN_CODEX_STRUCTURED, exec);
  if (!check.ok) {
    return {
      ok: false,
      kind: 'not-found',
      message: `aibridge: "codex" not found on PATH or wrong version. ${INSTALL_HINT}`,
      exitCode: null,
    };
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'aibridge-codex-'));
  const answerPath = join(tempDir, 'last_message.md');

  try {
    const config: string[] = [];
    if (task.effort) {
      config.push(`model_reasoning_effort=${task.effort}`);
    }

    const args = buildCodexExecArgs(task.prompt, {
      cwd: task.cwd,
      approval: task.tools ? 'bypass' : 'read-only',
      model: task.backendModel,
      config: config.length > 0 ? config : undefined,
      outputLastMessage: answerPath,
      timeoutMs: (task.timeoutSec + 20) * 1000,
    });

    let result: RunResult;
    try {
      result = await exec('codex', args, {
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
          message: `aibridge: "codex" not found on PATH. ${INSTALL_HINT}`,
          exitCode: null,
        };
      }
      return {
        ok: false,
        kind: 'spawn',
        message: `aibridge: failed to run codex: ${(err as Error).message}`,
        exitCode: null,
      };
    }

    if (result.timedOut) {
      return {
        ok: false,
        kind: 'timeout',
        message: `aibridge: codex timed out after ~${task.timeoutSec + 20}s; raise --timeout.`,
        exitCode: result.code,
      };
    }

    let response = '';
    if (existsSync(answerPath)) {
      response = clean(readFileSync(answerPath, 'utf8'));
      if (response.length > 0) {
        task.onStdout?.(`\n--- final answer ---\n${response}\n`);
      }
    }
    if (response.length === 0) {
      response = clean(result.stdout);
    }

    if (result.code !== 0 || response.length === 0) {
      const detail = clean(result.stderr) || `exit code ${result.code}`;
      return {
        ok: false,
        kind: 'no-answer',
        message: `aibridge: codex returned no usable answer (${detail}).`,
        exitCode: result.code,
      };
    }

    return { ok: true, response, exitCode: result.code ?? 0 };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
