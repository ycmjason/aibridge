import sharp from 'sharp';

export const CHROMA_CLAUSE =
  'The entire background must be a perfectly flat solid #00ff00 chroma-key green. The background must be one uniform colour with no shadows, gradients, texture, reflections, or lighting variation. Keep the subject fully separated from the background with crisp edges. Do not use #00ff00 or any similar green anywhere on the subject. No cast shadow, no contact shadow, no reflection.';

export const NATIVE_ALPHA_CLAUSE =
  'Render the subject on a fully transparent background — PNG with a real alpha channel, no backdrop, no canvas colour, no cast shadow.';

export interface KeyResult {
  readonly transparentRatio: number;
}

const GREEN_MIN = 90;
/**
 * How far green must lead both red and blue for a pixel to count as backdrop.
 * Position, not geometry, decides: a saturated green *subject* is keyed away too.
 * That is inherent to chroma keying — CHROMA_CLAUSE tells the model not to put
 * green on the subject, and a native-alpha seat is the answer when it must be.
 */
const DOMINANCE = 40;

export async function chromaKeyToPng(src: string, dest: string): Promise<KeyResult> {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const totalPixels = width * height;

  if (totalPixels === 0) {
    await sharp(data, { raw: { width, height, channels } })
      .png({ compressionLevel: 9 })
      .toFile(dest);
    return { transparentRatio: 0 };
  }

  // Pass 1 — key: detect background green pixels and set alpha to 0.
  const mask = new Uint8Array(totalPixels);
  let keyedCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * channels;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;

    if (g >= GREEN_MIN && g - r >= DOMINANCE && g - b >= DOMINANCE) {
      data[offset + 3] = 0;
      mask[i] = 1;
      keyedCount++;
    }
  }

  // ponytail: neighbour-gated despill — an ungated despill would grey out any green subject.
  // Ceiling: binary alpha, 1px fringe ring; upgrade path is a real matte (feathered alpha) if soft edges are ever needed.
  // Pass 2 — despill: clamp green for opaque fringe pixels adjacent to keyed pixels.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === 1) continue;

      const offset = idx * channels;
      const r = data[offset] ?? 0;
      const g = data[offset + 1] ?? 0;
      const b = data[offset + 2] ?? 0;

      if (g - r >= 20 && g - b >= 20) {
        const hasKeyedNeighbor =
          (x > 0 && mask[idx - 1] === 1) ||
          (x < width - 1 && mask[idx + 1] === 1) ||
          (y > 0 && mask[idx - width] === 1) ||
          (y < height - 1 && mask[idx + width] === 1);

        if (hasKeyedNeighbor) {
          data[offset + 1] = Math.max(r, b);
        }
      }
    }
  }

  await sharp(data, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toFile(dest);

  return {
    transparentRatio: keyedCount / totalPixels,
  };
}
