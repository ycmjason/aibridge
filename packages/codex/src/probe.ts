import { isNotFound, runCaptured } from '@aibridge/proc';
import { ensureCodex, MIN_CODEX_STRUCTURED } from './codex.ts';

export type Availability =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

const INSTALL_HINT = 'Install the Codex CLI and sign in to ChatGPT.';

export async function probe(run: typeof runCaptured = runCaptured): Promise<Availability> {
  try {
    const check = await ensureCodex(MIN_CODEX_STRUCTURED, run);
    if (check.ok) return { ok: true, version: check.version };
    return { ok: false, error: `aibridge: ${check.error}` };
  } catch (err) {
    if (isNotFound(err)) {
      return { ok: false, error: `aibridge: "codex" not found on PATH. ${INSTALL_HINT}` };
    }
    return { ok: false, error: `aibridge: failed to probe codex: ${(err as Error).message}` };
  }
}
