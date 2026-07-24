import { isNotFound, runCaptured } from '@aibridge/proc';
import { ensureGrok } from './grok.ts';

export type Availability =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

const INSTALL_HINT = 'Install the Grok CLI (npm i -g @xai-official/grok) and run `grok login`.';

export async function probe(run: typeof runCaptured = runCaptured): Promise<Availability> {
  try {
    const check = await ensureGrok(run);
    if (check.ok) return { ok: true, version: check.version };
    return { ok: false, error: `ai-bridge: ${check.error}` };
  } catch (err) {
    if (isNotFound(err)) {
      return { ok: false, error: `ai-bridge: "grok" not found on PATH. ${INSTALL_HINT}` };
    }
    return { ok: false, error: `ai-bridge: failed to probe grok: ${(err as Error).message}` };
  }
}
