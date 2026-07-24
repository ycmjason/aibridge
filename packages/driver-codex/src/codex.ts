import {
  isNotFound,
  parseSemver,
  probeVersion,
  type RunResult,
  runCaptured,
  semverGte,
} from '@aibridge/proc';

/**
 * Shared driver for the Codex CLI (`codex exec`), used by `image-gen` (gpt-image-2 renders)
 * and `delegate.ts` / the model registry (`lib/models.ts`).
 */

export const MIN_CODEX_IMAGE: readonly [number, number, number] = [0, 135, 0];
export const MIN_CODEX_STRUCTURED: readonly [number, number, number] = [0, 142, 0];

export type CodexApproval = 'full-auto' | 'bypass' | 'read-only';

export interface CodexExecOptions {
  readonly cwd: string;
  readonly approval: CodexApproval;
  readonly model: string;
  readonly images?: readonly string[];
  readonly outputLastMessage?: string;
  readonly outputSchema?: string;
  readonly config?: readonly string[];
  readonly timeoutMs: number;
  readonly onStdout?: (chunk: string) => void;
  readonly onStderr?: (chunk: string) => void;
  readonly onSpawn?: (pid: number) => void;
}

export type CodexCheck =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

export async function ensureCodex(
  min: readonly [number, number, number],
  run: typeof runCaptured = runCaptured,
): Promise<CodexCheck> {
  const version = await probeVersion('codex', run);
  if (version === null) {
    return {
      ok: false,
      error: '"codex" not found on PATH. Install the Codex CLI and sign in to ChatGPT.',
    };
  }
  const sem = parseSemver(version);
  if (!sem || !semverGte(sem, min)) {
    return {
      ok: false,
      error: `codex ${version} is too old; need >= ${min.join('.')}.`,
    };
  }
  return { ok: true, version };
}

export function buildCodexExecArgs(prompt: string, opts: CodexExecOptions): string[] {
  const args = ['exec'];
  if (opts.approval === 'bypass') {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  } else if (opts.approval === 'read-only') {
    args.push('-s', 'read-only');
  } else {
    args.push('--full-auto');
  }

  args.push('--skip-git-repo-check', '-C', opts.cwd);
  args.push('-m', opts.model);
  for (const c of opts.config ?? []) args.push('-c', c);
  if (opts.outputSchema) args.push('--output-schema', opts.outputSchema);
  if (opts.outputLastMessage) args.push('--output-last-message', opts.outputLastMessage);
  for (const img of opts.images ?? []) args.push(`--image=${img}`);
  args.push(prompt);
  return args;
}

export function runCodexExec(prompt: string, opts: CodexExecOptions): Promise<RunResult> {
  return runCaptured('codex', buildCodexExecArgs(prompt, opts), {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    onStdout: opts.onStdout,
    onStderr: opts.onStderr,
    onSpawn: opts.onSpawn,
  });
}

export { isNotFound };
