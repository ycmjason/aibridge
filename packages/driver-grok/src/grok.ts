import { isNotFound, probeVersion, type RunResult, runCaptured } from '@aibridge/proc';

/**
 * Shared driver for the xAI Grok CLI (`grok -p`), an off-budget backend for
 * delegate.ts and the model registry (`lib/models.ts`).
 */

export type GrokEffort = 'low' | 'medium' | 'high' | string;

export type GrokCheck =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

const NOT_AUTHENTICATED_RE = /not authenticated/i;

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

export async function ensureGrok(run: typeof runCaptured = runCaptured): Promise<GrokCheck> {
  const version = await probeVersion('grok', run);
  if (version === null) {
    return {
      ok: false,
      error: '"grok" not found on PATH. Install the Grok CLI (npm i -g @xai-official/grok).',
    };
  }
  if (!(await probeGrokAuth(run))) {
    return { ok: false, error: 'grok is not signed in. Run `grok login`.' };
  }
  return { ok: true, version };
}

export interface GrokPrintArgs {
  readonly model: string;
  readonly effort?: GrokEffort;
  readonly skipPermissions?: boolean;
  readonly jsonSchema?: string;
  readonly tools?: string;
  readonly maxTurns?: number;
}

export function buildGrokPrintArgs(prompt: string, opts: GrokPrintArgs): string[] {
  const args = ['-p', prompt];
  args.push('--model', opts.model);
  if (opts.effort) args.push('--reasoning-effort', opts.effort);
  if (opts.skipPermissions) args.push('--permission-mode', 'bypassPermissions');
  if (opts.jsonSchema) args.push('--json-schema', opts.jsonSchema);
  if (opts.tools) args.push('--tools', opts.tools);
  if (opts.maxTurns !== undefined) args.push('--max-turns', String(opts.maxTurns));
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
