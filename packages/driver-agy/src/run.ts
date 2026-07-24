import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isNotFound, type RunResult, runCaptured, stripAnsi } from '@aibridge/proc';
import { buildAgyPrintArgs } from './agy.ts';

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
const INSTALL_HINT = 'Install the Antigravity CLI and sign in.';

function clean(s: string): string {
  return stripAnsi(s).replace(NOISE_RE, '').trim();
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

  const args = buildAgyPrintArgs(taskPrompt, {
    model: task.backendModel,
    printTimeoutSec: task.timeoutSec,
    skipPermissions: task.tools,
    addDirs: addDirs.length > 0 ? addDirs : undefined,
  });

  try {
    let result: RunResult;
    try {
      result = await exec('agy', args, {
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

    if (result.timedOut) {
      return {
        ok: false,
        kind: 'timeout',
        message: `aibridge: agy timed out after ~${task.timeoutSec + 20}s; raise --timeout.`,
        exitCode: result.code,
      };
    }

    let response = '';
    if (answerPath && existsSync(answerPath)) {
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
        message: `aibridge: agy returned no usable answer (${detail}).`,
        exitCode: result.code,
      };
    }

    return { ok: true, response, exitCode: result.code ?? 0 };
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}
