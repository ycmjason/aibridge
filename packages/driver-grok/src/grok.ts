import { isNotFound, probeVersion, type RunResult, runCaptured } from '@aibridge/proc';

/**
 * Shared driver for the xAI Grok CLI (`grok -p`), an off-budget backend for
 * delegate.ts and the model registry (`lib/models.ts`).
 */

export type GrokEffort = 'low' | 'medium' | 'high' | string;

export type GrokCheck =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

/**
 * grok 1.0.5 loads ~/.claude/CLAUDE.md as <user_rules> and attaches Claude's MCP
 * servers, so a delegate inherits the operator's own agent instructions — which
 * burned every turn of image-gen's budget on skill-loading before it could call
 * the image tool. Delegates get the task, not the operator's rulebook.
 */
export const GROK_COMPAT_ENV = {
  GROK_CLAUDE_RULES_ENABLED: '0',
  GROK_CLAUDE_SKILLS_ENABLED: '0',
  GROK_CLAUDE_MCPS_ENABLED: '0',
  GROK_CLAUDE_AGENTS_ENABLED: '0',
} as const;

/** process.env last: an explicitly exported override still wins. */
export function grokEnv(): NodeJS.ProcessEnv {
  return { ...GROK_COMPAT_ENV, ...process.env };
}

/**
 * Nudge the CLI into refreshing its own cached token, used by the quota probe
 * after a 401. Verified against grok 1.0.4: `grok models` prints "You are not
 * authenticated." even when `grok -p` answers fine, so its OUTPUT is not a
 * usable sign-in signal — we spawn it only for the side effect and ignore what
 * it says. A genuinely signed-out grok is caught downstream, off the CLI's own
 * refusal text (see run.ts).
 */
export async function refreshGrokAuth(run: typeof runCaptured = runCaptured): Promise<void> {
  await run('grok', ['models'], { timeoutMs: 10_000, env: grokEnv() }).catch(() => {});
}

export async function ensureGrok(run: typeof runCaptured = runCaptured): Promise<GrokCheck> {
  const version = await probeVersion('grok', run);
  if (version === null) {
    return {
      ok: false,
      error: '"grok" not found on PATH. Install the Grok CLI (npm i -g @xai-official/grok).',
    };
  }
  return { ok: true, version };
}

export interface GrokPrintArgs {
  readonly model: string;
  readonly effort?: GrokEffort;
  readonly skipPermissions?: boolean;
  readonly jsonSchema?: string;
}

export function buildGrokPrintArgs(prompt: string, opts: GrokPrintArgs): string[] {
  const args = ['-p', prompt];
  args.push('--model', opts.model);
  if (opts.effort) args.push('--reasoning-effort', opts.effort);
  if (opts.skipPermissions) args.push('--permission-mode', 'bypassPermissions');
  if (opts.jsonSchema) args.push('--json-schema', opts.jsonSchema);
  return args;
}

export interface GrokPrintOptions extends GrokPrintArgs {
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly onStdout?: (chunk: string) => void;
  readonly onStderr?: (chunk: string) => void;
  readonly onSpawn?: (pid: number) => void;
}

export function runGrokPrint(prompt: string, opts: GrokPrintOptions): Promise<RunResult> {
  return runCaptured('grok', buildGrokPrintArgs(prompt, opts), {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    env: grokEnv(),
    onStdout: opts.onStdout,
    onStderr: opts.onStderr,
    onSpawn: opts.onSpawn,
  });
}

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

export { isNotFound };
