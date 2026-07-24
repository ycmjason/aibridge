import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAgyPrintArgs } from './agy.ts';
import { buildClaudePrintArgs } from './claude.ts';
import { buildCodexExecArgs, ensureCodex, MIN_CODEX_STRUCTURED } from './codex.ts';
import { buildGrokPrintArgs } from './grok.ts';
import { type Backend, backendModelId, type ResolvedModel } from './models.ts';
import { isNotFound, type RunResult, runCaptured, stripAnsi } from './proc.ts';
import type { RunLog } from './runlog.ts';

export interface DelegateOptions {
  readonly model: ResolvedModel;
  readonly prompt: string;
  readonly tools: boolean;
  readonly timeoutSec: number;
  readonly cwd: string;
  readonly run: RunLog;
}

export type DelegateOutcome =
  | { readonly ok: true; readonly response: string; readonly exitCode: number }
  | {
      readonly ok: false;
      readonly kind: 'not-found' | 'spawn' | 'timeout' | 'no-answer';
      readonly message: string;
    };

const NOISE_RE = /^Shell cwd was reset[^\n]*$/gm;

const INSTALL_HINT: Record<Backend, string> = {
  agy: 'Install the Antigravity CLI and sign in.',
  claude: 'Install Claude Code and sign in.',
  codex: 'Install the Codex CLI and sign in to ChatGPT.',
  grok: 'Install the Grok CLI (npm i -g @xai-official/grok) and run `grok login`.',
};

function clean(s: string): string {
  return stripAnsi(s).replace(NOISE_RE, '').trim();
}

/**
 * Low-level execution engine that spawns the appropriate CLI backend
 * for a resolved model spec and captures the response.
 */
export async function delegate(opts: DelegateOptions): Promise<DelegateOutcome> {
  const { model, prompt, tools, timeoutSec, cwd, run } = opts;
  const backend = model.spec.backend;

  // Tools-mode preamble
  const effectivePrompt = tools
    ? `You are the sole executing agent for this task: do it yourself with your tools, now. ` +
      `Never defer to, wait for, or claim to hand off to another agent or process — no one ` +
      `else will act, and work not done in this run does not happen.\n\n${prompt}`
    : prompt;

  let tempDir: string | undefined;
  let answerPath: string | undefined;
  let args: string[];

  if (backend === 'codex') {
    const check = await ensureCodex(MIN_CODEX_STRUCTURED);
    if (!check.ok) {
      run.finish('error', null);
      return {
        ok: false,
        kind: 'not-found',
        message: `ai-bridge: "${backend}" not found on PATH or wrong version. ${INSTALL_HINT.codex}`,
      };
    }
  }

  if (backend === 'agy') {
    let taskPrompt = effectivePrompt;
    const addDirs: string[] = [];
    if (tools) {
      tempDir = mkdtempSync(join(tmpdir(), 'ai-bridge-agy-'));
      answerPath = join(tempDir, 'answer.md');
      taskPrompt =
        `${effectivePrompt}\n\nYou are working in the repository rooted at ${cwd}; make ALL file ` +
        `edits there (any relative paths in the task are relative to that root). When the task ` +
        `is complete, write ONLY your final answer (the exact text you would otherwise print as ` +
        `your response, with no narration of your steps) to the file ${answerPath} — nothing else ` +
        `in that file. This is how your answer is captured; do not mention the file in the answer.`;
      addDirs.push(cwd, tempDir);
    }
    const modelId = backendModelId(model) ?? model.spec.backendModel ?? '';
    args = buildAgyPrintArgs(taskPrompt, {
      model: modelId,
      printTimeoutSec: timeoutSec,
      skipPermissions: tools,
      addDirs: addDirs.length > 0 ? addDirs : undefined,
    });
  } else if (backend === 'grok') {
    const modelId = backendModelId(model) ?? model.spec.backendModel;
    args = buildGrokPrintArgs(effectivePrompt, {
      model: modelId,
      effort: model.effort,
      skipPermissions: tools,
    });
  } else if (backend === 'claude') {
    const modelId = model.spec.backendModel ?? 'sonnet';
    args = buildClaudePrintArgs(effectivePrompt, {
      model: modelId,
      effort: model.effort,
      skipPermissions: tools,
    });
  } else if (backend === 'codex') {
    tempDir = mkdtempSync(join(tmpdir(), 'ai-bridge-codex-'));
    answerPath = join(tempDir, 'last_message.md');
    const modelId = backendModelId(model) ?? model.spec.backendModel;
    const config: string[] = [];
    if (model.effort) {
      config.push(`model_reasoning_effort=${model.effort}`);
    }
    args = buildCodexExecArgs(effectivePrompt, {
      cwd,
      approval: tools ? 'bypass' : 'read-only',
      model: modelId,
      config: config.length > 0 ? config : undefined,
      outputLastMessage: answerPath,
      timeoutMs: (timeoutSec + 20) * 1000,
    });
  } else {
    run.finish('error', null);
    return { ok: false, kind: 'spawn', message: `Unknown backend "${backend}"` };
  }

  try {
    let result: RunResult;
    try {
      result = await runCaptured(backend, args, {
        cwd,
        timeoutMs: (timeoutSec + 20) * 1000,
        onStdout: chunk => run.stdout(chunk),
        onStderr: chunk => run.stderr(chunk),
        onSpawn: pid => run.setPid(pid),
      });
    } catch (err) {
      run.finish('error', null);
      if (isNotFound(err)) {
        return {
          ok: false,
          kind: 'not-found',
          message: `ai-bridge: "${backend}" not found on PATH. ${INSTALL_HINT[backend]}`,
        };
      }
      return {
        ok: false,
        kind: 'spawn',
        message: `ai-bridge: failed to run ${backend}: ${(err as Error).message}`,
      };
    }

    if (result.timedOut) {
      run.finish('timeout', result.code);
      return {
        ok: false,
        kind: 'timeout',
        message: `ai-bridge: ${backend} timed out after ~${timeoutSec + 20}s; raise --timeout.`,
      };
    }

    let response = '';
    if (answerPath && existsSync(answerPath)) {
      response = clean(readFileSync(answerPath, 'utf8'));
      if (response.length > 0) {
        run.stdout(`\n--- final answer ---\n${response}\n`);
      }
    }
    if (response.length === 0) {
      response = clean(result.stdout);
    }

    if (result.code !== 0 || response.length === 0) {
      run.finish('error', result.code);
      const detail = clean(result.stderr) || `exit code ${result.code}`;
      return {
        ok: false,
        kind: 'no-answer',
        message: `ai-bridge: ${backend} returned no usable answer (${detail}).`,
      };
    }

    run.finish('done', result.code);
    return { ok: true, response, exitCode: result.code };
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}
