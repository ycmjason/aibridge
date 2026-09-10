import type { AgentCliDriver, ImageGenRequest, ImageResult } from './driver.ts';
import type { ResolvedModel } from './models.ts';

/** Codex writes a real render as a large PNG; a code-drawn stand-in is tiny. Tool backends are JPEG. */
const MIN_REAL_BYTES_CODEX = 100_000;
const MIN_REAL_BYTES_TOOL = 10_000;

export function minRealBytes(model: ResolvedModel): number {
  return model.spec.backend === 'codex' ? MIN_REAL_BYTES_CODEX : MIN_REAL_BYTES_TOOL;
}

export type RenderOutcome =
  | { readonly kind: 'ok'; readonly path: string; readonly bytes: number }
  | { readonly kind: 'error'; readonly reason: string };

/**
 * One paid render with the size sanity check, and codex's single forceful retry
 * when the first pass came back as a code-drawn substitute. Shared by every
 * command that spends an image call so the retry policy lives once.
 */
export async function renderImage(
  driver: AgentCliDriver,
  model: ResolvedModel,
  req: Omit<ImageGenRequest, 'forceful' | 'minBytes'>,
): Promise<RenderOutcome> {
  if (!driver.generateImage) {
    return { kind: 'error', reason: `${model.spec.slug} has no image renderer` };
  }
  const minBytes = minRealBytes(model);
  let outcome: ImageResult = await driver.generateImage({ ...req, forceful: false, minBytes });

  if (model.spec.backend === 'codex' && outcome.kind === 'suspect') {
    outcome = await driver.generateImage({ ...req, forceful: true, minBytes });
  }
  if (outcome.kind === 'ok' && outcome.bytes < minBytes) {
    outcome = { kind: 'suspect' };
  }
  if (outcome.kind === 'suspect') {
    return {
      kind: 'error',
      reason:
        model.spec.backend === 'agy'
          ? 'agy produced no usable image. Re-run with a simpler prompt, or check Antigravity image access.'
          : model.spec.backend === 'grok'
            ? 'grok produced no usable image. Check SuperGrok image access and re-run with a simpler prompt.'
            : 'codex produced only a tiny/code-drawn image, not a real render. Try a clearer, simpler prompt.',
    };
  }
  return outcome;
}
