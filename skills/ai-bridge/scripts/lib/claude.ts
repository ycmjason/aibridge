import type { Effort } from './models.ts';
import { isNotFound, probeVersion, type RunResult, runCaptured } from './proc.ts';

/**
 * Shared driver for the Claude Code CLI (`claude -p`), the FALLBACK backend for
 * delegate.ts and the model registry (`lib/models.ts`).
 *
 * Deliberate cost note: unlike agy/codex, everything run through here bills the
 * user's own Claude subscription. Callers surface that in their help text; this
 * module only owns the mechanics.
 *
 * Verified facts (claude 2.1.198, spiked 2026-07-02):
 * - `claude -p <prompt>` prints ONLY the final answer to a piped stdout — no
 *   narration, no answer-file dance needed (unlike agy).
 * - `--model` accepts aliases (`haiku`, `opus`, `sonnet`) or full model names.
 * - `--effort low|medium|high|xhigh|max` sets reasoning effort.
 * - `--json-schema '<inline json>'` constrains the final message to the schema
 *   and composes with tool use + `--dangerously-skip-permissions` (verified:
 *   shell command run + conforming JSON emitted in one print run).
 * - `--dangerously-skip-permissions` is required for any file edit / shell use
 *   in print mode; without it, permission-gated tools are denied silently.
 */

export type ClaudeEffort = Effort;

export interface ClaudePrintArgs {
  /** Model alias or full name passed to `--model`. */
  readonly model: string;
  /** Reasoning effort (`--effort`); omit for the CLI default. */
  readonly effort?: ClaudeEffort;
  /** Allow file edits / shell commands without prompts. */
  readonly skipPermissions?: boolean;
  /** Extra directories the tools may touch (`--add-dir`, repeatable). */
  readonly addDirs?: readonly string[];
  /** Inline JSON Schema (`--json-schema`) the final message must conform to. */
  readonly jsonSchema?: string;
}

export interface ClaudePrintOptions extends ClaudePrintArgs {
  /** Working directory the run is rooted in (claude respects its spawn cwd). */
  readonly cwd: string;
  /** Hard kill ceiling in ms. */
  readonly timeoutMs: number;
  readonly onStdout?: (chunk: string) => void;
  readonly onStderr?: (chunk: string) => void;
  readonly onSpawn?: (pid: number) => void;
}

export type ClaudeCheck =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

/** Verify the claude CLI is on PATH. Returns a clear error string otherwise. */
export async function ensureClaude(): Promise<ClaudeCheck> {
  const version = await probeVersion('claude');
  if (version === null) {
    return {
      ok: false,
      error: '"claude" not found on PATH. Install Claude Code and sign in.',
    };
  }
  return { ok: true, version };
}

/** Assemble the `claude -p …` argv. Prompt right after `-p` so no variadic flag can swallow it. */
export function buildClaudePrintArgs(prompt: string, opts: ClaudePrintArgs): string[] {
  const args = ['-p', prompt, '--model', opts.model];
  if (opts.effort) args.push('--effort', opts.effort);
  if (opts.skipPermissions) args.push('--dangerously-skip-permissions');
  for (const dir of opts.addDirs ?? []) args.push('--add-dir', dir);
  if (opts.jsonSchema) args.push('--json-schema', opts.jsonSchema);
  return args;
}

/**
 * Spawn `claude -p` and capture it. Rejects only on spawn failure (e.g. ENOENT);
 * a non-zero exit resolves normally with the captured streams (see `runCaptured`).
 */
export function runClaudePrint(prompt: string, opts: ClaudePrintOptions): Promise<RunResult> {
  return runCaptured('claude', buildClaudePrintArgs(prompt, opts), {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    onStdout: opts.onStdout,
    onStderr: opts.onStderr,
    onSpawn: opts.onSpawn,
  });
}

/** Re-exported so callers can distinguish a missing binary from other spawn errors. */
export { isNotFound };
