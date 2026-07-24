import { isNotFound, runCaptured } from '@aibridge/proc';

export type Availability =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

const INSTALL_HINT = 'Install the Antigravity CLI and sign in.';

export async function probe(run: typeof runCaptured = runCaptured): Promise<Availability> {
  try {
    const res = await run('agy', ['--version'], { timeoutMs: 10_000 });
    if (res.timedOut) {
      return { ok: false, error: 'aibridge: "agy" timed out probing version.' };
    }
    const line = (res.stdout || res.stderr).split('\n')[0]?.trim();
    if (line && line.length > 0) {
      return { ok: true, version: line };
    }
    return { ok: false, error: `aibridge: "agy" returned no version output. ${INSTALL_HINT}` };
  } catch (err) {
    if (isNotFound(err)) {
      return { ok: false, error: `aibridge: "agy" not found on PATH. ${INSTALL_HINT}` };
    }
    return { ok: false, error: `aibridge: failed to probe agy: ${(err as Error).message}` };
  }
}
