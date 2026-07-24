import { isNotFound, runCaptured } from '@ai-bridge/proc';
import { ensureCodex, MIN_CODEX_STRUCTURED } from './codex.ts';

export type Availability =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

const INSTALL_HINT = 'Install the Codex CLI and sign in to ChatGPT.';

export async function probe(run: typeof runCaptured = runCaptured): Promise<Availability> {
  try {
    const check = await ensureCodex(MIN_CODEX_STRUCTURED, run);
    if (check.ok) return { ok: true, version: check.version };
    return { ok: false, error: `ai-bridge: ${check.error}` };
  } catch (err) {
    if (isNotFound(err)) {
      return { ok: false, error: `ai-bridge: "codex" not found on PATH. ${INSTALL_HINT}` };
    }
    return { ok: false, error: `ai-bridge: failed to probe codex: ${(err as Error).message}` };
  }
}
