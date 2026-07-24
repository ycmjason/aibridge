import { isNotFound, probeVersion, type RunResult, runCaptured } from '@aibridge/proc';

/**
 * Shared driver for the Claude Code CLI (`claude -p`), the FALLBACK backend for
 * delegate.ts and the model registry (`lib/models.ts`).
 */

export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | string;

export interface ClaudePrintArgs {
  readonly model: string;
  readonly effort?: ClaudeEffort;
  readonly skipPermissions?: boolean;
  readonly addDirs?: readonly string[];
  readonly jsonSchema?: string;
}

export interface ClaudePrintOptions extends ClaudePrintArgs {
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly onStdout?: (chunk: string) => void;
  readonly onStderr?: (chunk: string) => void;
  readonly onSpawn?: (pid: number) => void;
}

export type ClaudeCheck =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

export async function ensureClaude(run: typeof runCaptured = runCaptured): Promise<ClaudeCheck> {
  const version = await probeVersion('claude', run);
  if (version === null) {
    return {
      ok: false,
      error: '"claude" not found on PATH. Install Claude Code and sign in.',
    };
  }
  return { ok: true, version };
}

export function buildClaudePrintArgs(prompt: string, opts: ClaudePrintArgs): string[] {
  const args = ['-p', prompt, '--model', opts.model];
  if (opts.effort) args.push('--effort', opts.effort);
  if (opts.skipPermissions) args.push('--dangerously-skip-permissions');
  for (const dir of opts.addDirs ?? []) args.push('--add-dir', dir);
  if (opts.jsonSchema) args.push('--json-schema', opts.jsonSchema);
  return args;
}

export function runClaudePrint(prompt: string, opts: ClaudePrintOptions): Promise<RunResult> {
  return runCaptured('claude', buildClaudePrintArgs(prompt, opts), {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    onStdout: opts.onStdout,
    onStderr: opts.onStderr,
    onSpawn: opts.onSpawn,
  });
}

export { isNotFound };
