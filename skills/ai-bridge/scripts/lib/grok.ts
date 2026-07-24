import type { Effort } from './models.ts';
import { isNotFound, probeVersion, type RunResult, runCaptured } from './proc.ts';

/**
 * Shared driver for the xAI Grok CLI (`grok -p`), an off-budget backend for
 * delegate.ts and the model registry (`lib/models.ts`).
 *
 * Verified facts (grok 0.2.93, spiked 2026-07-13):
 * - `grok -p <prompt>` prints ONLY the final response to a piped stdout —
 *   claude-style, no narration.
 * - `--model` takes CLI model IDs (`grok models` to list; `grok-4.5` default).
 * - `--permission-mode bypassPermissions` is required for file edits / shell in
 *   headless mode; without it gated tools are denied — the no-tools posture.
 * - `--json-schema '<inline json>'` constrains the final message BUT switches
 *   stdout to a JSON ENVELOPE: `{ text, stopReason, sessionId, thought,
 *   structuredOutput }` where `structuredOutput` is the conforming object
 *   (`text` is the same JSON as a string). Unwrap via extractStructuredOutput.
 * - `grok models` is fast, exits 0 authed or not; first stdout line says
 *   "You are logged in …" vs "You are not authenticated."
 * - EXPIRED-token refresh race (observed 2026-07-22): with a merely-expired
 *   access token, `grok models` prints "You are not authenticated." AND kicks
 *   off a background token refresh that rewrites ~/.grok/auth.json seconds
 *   later (probe at 19:44:19 said unauthenticated; auth.json mtime 19:44:27;
 *   the identical probe later that evening said "You are logged in" against
 *   the SAME auth.json). A single probe therefore false-negatives.
 *   That's why probeGrokAuth retries once after ~2s — do NOT reintroduce a single probe.
 * - Rate reality: ~30 req/min and ~1k msgs/day per xAI account, and no local
 *   usage probe — run ONE grok at a time and let rate-cap errors surface.
 */

export type GrokCheck =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

const NOT_AUTHENTICATED_RE = /not authenticated/i;

/**
 * True when `grok models` reports an authenticated session. An expired (but
 * refreshable) token makes the FIRST probe say "not authenticated" while it
 * triggers the refresh in the background (see the verified facts above), so a
 * "not authenticated" answer is only trusted after a second probe ~2s later.
 * Runner/sleep are injectable for tests; defaults are the real thing.
 */
export async function probeGrokAuth(
  run: typeof runCaptured = runCaptured,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<boolean> {
  const probe = async (): Promise<boolean> => {
    const res = await run('grok', ['models'], { timeoutMs: 10_000 });
    return !NOT_AUTHENTICATED_RE.test(res.stdout + res.stderr);
  };
  if (await probe()) return true;
  await sleep(2_000);
  return probe();
}

/** Verify the grok CLI is on PATH and signed in. Returns a clear error string otherwise. */
export async function ensureGrok(): Promise<GrokCheck> {
  const version = await probeVersion('grok');
  if (version === null) {
    return {
      ok: false,
      error: '"grok" not found on PATH. Install the Grok CLI (npm i -g @xai-official/grok).',
    };
  }
  if (!(await probeGrokAuth())) {
    return { ok: false, error: 'grok is not signed in. Run `grok login`.' };
  }
  return { ok: true, version };
}

export interface GrokPrintArgs {
  /** Model ID passed to `--model`; omit for the CLI default (grok-4.5). */
  readonly model?: string;
  /** Reasoning effort (`--reasoning-effort`). */
  readonly effort?: Effort;
  /** Allow file edits / shell commands without prompts. */
  readonly skipPermissions?: boolean;
  /** Inline JSON Schema (`--json-schema`) — NOTE: switches stdout to the envelope. */
  readonly jsonSchema?: string;
  /**
   * Headless-only allowlist of built-in tools (`--tools`, comma-separated tool
   * IDs). e.g. `image_gen` for image-gen; omit to leave the full default set.
   */
  readonly tools?: string;
  /** Headless-only max agent turns (`--max-turns`). */
  readonly maxTurns?: number;
}

/** Assemble the `grok -p …` argv. Prompt right after `-p` so no variadic flag can swallow it. */
export function buildGrokPrintArgs(prompt: string, opts: GrokPrintArgs = {}): string[] {
  const args = ['-p', prompt];
  if (opts.model) args.push('--model', opts.model);
  if (opts.effort) args.push('--reasoning-effort', opts.effort);
  if (opts.skipPermissions) args.push('--permission-mode', 'bypassPermissions');
  if (opts.jsonSchema) args.push('--json-schema', opts.jsonSchema);
  if (opts.tools) args.push('--tools', opts.tools);
  if (opts.maxTurns !== undefined) args.push('--max-turns', String(opts.maxTurns));
  return args;
}

export interface GrokPrintOptions extends GrokPrintArgs {
  /** Working directory the run is rooted in (grok respects its spawn cwd). */
  readonly cwd: string;
  /** Hard kill ceiling in ms. */
  readonly timeoutMs: number;
  readonly onStdout?: (chunk: string) => void;
  readonly onStderr?: (chunk: string) => void;
  readonly onSpawn?: (pid: number) => void;
}

/**
 * Spawn `grok -p` and capture it. Rejects only on spawn failure (e.g. ENOENT);
 * a non-zero exit resolves normally with the captured streams (see `runCaptured`).
 */
export function runGrokPrint(prompt: string, opts: GrokPrintOptions): Promise<RunResult> {
  return runCaptured('grok', buildGrokPrintArgs(prompt, opts), {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    onStdout: opts.onStdout,
    onStderr: opts.onStderr,
    onSpawn: opts.onSpawn,
  });
}

/**
 * Unwrap a `--json-schema` run's stdout envelope to the conforming object.
 * Falls back to the `text` field, then to the raw stdout (in case a future
 * grok drops the envelope). Returns null when nothing parses.
 */
export function extractStructuredOutput(stdout: string): unknown | null {
  const raw = stdout.trim();
  if (raw.length === 0) return null;
  try {
    const envelope = JSON.parse(raw) as {
      structuredOutput?: unknown;
      text?: unknown;
    };
    if (envelope && typeof envelope === 'object') {
      if (envelope.structuredOutput !== undefined && envelope.structuredOutput !== null) {
        return envelope.structuredOutput;
      }
      if (typeof envelope.text === 'string') {
        try {
          return JSON.parse(envelope.text);
        } catch {
          return null;
        }
      }
      return envelope;
    }
    return null;
  } catch {
    return null;
  }
}

/** Re-exported so callers can distinguish a missing binary from other spawn errors. */
export { isNotFound };
