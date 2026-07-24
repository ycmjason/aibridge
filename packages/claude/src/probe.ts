import { isNotFound, runCaptured } from '@aibridge/proc';
import { ensureClaude } from './claude.ts';

export type Availability =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

const INSTALL_HINT = 'Install Claude Code and sign in.';

export async function probe(_run: typeof runCaptured = runCaptured): Promise<Availability> {
  try {
    const check = await ensureClaude();
    if (check.ok) return { ok: true, version: check.version };
    return { ok: false, error: `ai-bridge: ${check.error}` };
  } catch (err) {
    if (isNotFound(err)) {
      return { ok: false, error: `ai-bridge: "claude" not found on PATH. ${INSTALL_HINT}` };
    }
    return { ok: false, error: `ai-bridge: failed to probe claude: ${(err as Error).message}` };
  }
}
