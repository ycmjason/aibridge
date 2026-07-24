import {
  isNotFound,
  parseSemver,
  probeVersion,
  type RunResult,
  runCaptured,
  semverGte,
} from './proc.ts';

/**
 * Shared driver for the Codex CLI (`codex exec`), used by `image-gen` (gpt-image-2 renders)
 * and `delegate.ts` / the model registry (`lib/models.ts`).
 */

/** Minimum codex with the built-in `image_gen` tool (a stale codex hangs on `$imagegen`). */
export const MIN_CODEX_IMAGE: readonly [number, number, number] = [0, 135, 0];
/** Minimum codex with `--output-schema` / `--output-last-message` (structured exec). */
export const MIN_CODEX_STRUCTURED: readonly [number, number, number] = [0, 142, 0];

/**
 * How much the world codex can touch:
 * - `full-auto`  — codex's `--full-auto` (workspace-write sandbox, network OFF).
 * - `bypass`     — `--dangerously-bypass-approvals-and-sandbox`. Full machine access.
 * - `read-only`  — `-s read-only` (read-only sandbox mode).
 */
export type CodexApproval = 'full-auto' | 'bypass' | 'read-only';

export interface CodexExecOptions {
  /** Working root passed as `-C` (codex reads/writes here). */
  readonly cwd: string;
  readonly approval: CodexApproval;
  /** Model ID passed as `-m <model>`. */
  readonly model?: string;
  /** Reference image(s) attached with `--image=` (bound form, so the variadic flag can't eat the prompt). */
  readonly images?: readonly string[];
  /** `--output-last-message <file>`: codex writes its final message here verbatim. */
  readonly outputLastMessage?: string;
  /** `--output-schema <file>`: JSON Schema the final message must conform to. */
  readonly outputSchema?: string;
  /** Extra `-c key=value` config overrides. */
  readonly config?: readonly string[];
  /** Hard kill ceiling in ms. */
  readonly timeoutMs: number;
  readonly onStdout?: (chunk: string) => void;
  readonly onStderr?: (chunk: string) => void;
  readonly onSpawn?: (pid: number) => void;
}

export type CodexCheck =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

/** Verify codex is on PATH and new enough. Returns a clear error string otherwise. */
export async function ensureCodex(min: readonly [number, number, number]): Promise<CodexCheck> {
  const version = await probeVersion('codex');
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

/** Assemble the `codex exec …` argv. Prompt is always last so no variadic flag can swallow it. */
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
  if (opts.model) args.push('-m', opts.model);
  for (const c of opts.config ?? []) args.push('-c', c);
  if (opts.outputSchema) args.push('--output-schema', opts.outputSchema);
  if (opts.outputLastMessage) args.push('--output-last-message', opts.outputLastMessage);
  for (const img of opts.images ?? []) args.push(`--image=${img}`);
  args.push(prompt);
  return args;
}

/**
 * Spawn `codex exec` and capture it. Rejects only on spawn failure (e.g. ENOENT);
 * a non-zero exit resolves normally with the captured streams (see `runCaptured`).
 */
export function runCodexExec(prompt: string, opts: CodexExecOptions): Promise<RunResult> {
  return runCaptured('codex', buildCodexExecArgs(prompt, opts), {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    onStdout: opts.onStdout,
    onStderr: opts.onStderr,
    onSpawn: opts.onSpawn,
  });
}

/** Re-exported so callers can distinguish a missing binary from other spawn errors. */
export { isNotFound };
