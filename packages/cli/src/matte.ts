import sharp from 'sharp';

/**
 * Difference matting: the same subject over two known flat backgrounds gives two
 * observations per pixel, enough to solve for alpha and the true foreground
 * colour (observed = a·F + (1-a)·B). This is the technique behind
 * https://github.com/privatenumber/unbg, inlined because the core is ~40 lines
 * and the decode/encode already runs on sharp here.
 */

export type Rgb = readonly [number, number, number];

export interface MatteOptions {
  /** Alpha at or below this snaps to 0 — absorbs JPEG noise in the backdrop. */
  readonly floor?: number;
  /** Alpha at or above this snaps to 1 — absorbs JPEG noise on the subject. */
  readonly ceiling?: number;
}

export interface MatteResult {
  readonly width: number;
  readonly height: number;
  readonly background1: Rgb;
  readonly background2: Rgb;
  /** Euclidean distance between the two backgrounds; under ~50 the matte is noise. */
  readonly backgroundDistance: number;
  /** Share of pixels that came out fully transparent. */
  readonly transparentRatio: number;
  /** Share of pixels with partial alpha — the real edge ring once floor/ceiling apply. */
  readonly softRatio: number;
  /**
   * Share of visible pixels whose two foreground estimates disagree by more than
   * a JPEG quantisation step. That is the subject moving between the two
   * renders, the one thing the pair must not do.
   */
  readonly drift: number;
  /** The first image was rescaled to the second's size before solving. */
  readonly resized: boolean;
}

/** Measured on agy and grok JPEG pairs: backdrop noise peaks ~14/255, subject dips to ~240/255. */
const DEFAULT_FLOOR = 0.08;
const DEFAULT_CEILING = 0.92;
/** Below this per-channel background gap a channel says nothing about alpha (unbg's default). */
const CHANNEL_THRESHOLD = 10;
const MIN_DISTANCE = 50;
const DRIFT_STEP = 24;
/**
 * Flat-border test, measured on real renders: a flat backdrop keeps ≥75% of its
 * ring within 8 of the median even with a subject cropped by two edges; a dark
 * night scene sits at 31%. Tolerance 24 let the scene through at 85%.
 */
const FLAT_TOLERANCE = 8;
const FLAT_SHARE = 0.6;

interface Raw {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

async function decodeRgb(path: string, size?: { width: number; height: number }): Promise<Raw> {
  let pipeline = sharp(path).toColourspace('srgb').removeAlpha();
  if (size) pipeline = pipeline.resize(size.width, size.height, { fit: 'fill' });
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) {
    throw new Error(`expected 3-channel RGB from ${path}, got ${info.channels}`);
  }
  return { data, width: info.width, height: info.height };
}

/** Per-channel median of the one-pixel border ring. A subject touching one edge cannot drag it. */
export function borderColour(img: Raw): Rgb {
  const { data, width, height } = img;
  const samples: [number[], number[], number[]] = [[], [], []];
  const push = (x: number, y: number) => {
    const o = (y * width + x) * 3;
    samples[0].push(data[o] ?? 0);
    samples[1].push(data[o + 1] ?? 0);
    samples[2].push(data[o + 2] ?? 0);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    if (height > 1) push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    push(0, y);
    if (width > 1) push(width - 1, y);
  }
  const median = (xs: number[]) => {
    xs.sort((a, b) => a - b);
    return xs[xs.length >> 1] ?? 0;
  };
  return [median(samples[0]), median(samples[1]), median(samples[2])];
}

export async function imageAspect(path: string): Promise<{ width: number; height: number }> {
  const meta = await sharp(path).metadata();
  return { width: meta.width, height: meta.height };
}

export function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Is the border ring one flat colour? Used as the pre-spend check for a cutout
 * with no subject: an image that fails this needs an isolation edit first.
 */
export async function hasFlatBorder(path: string): Promise<{ flat: boolean; colour: Rgb }> {
  const img = await decodeRgb(path);
  const colour = borderColour(img);
  const { data, width, height } = img;
  let ring = 0;
  let near = 0;
  const check = (x: number, y: number) => {
    const o = (y * width + x) * 3;
    ring++;
    if (
      Math.abs((data[o] ?? 0) - colour[0]) <= FLAT_TOLERANCE &&
      Math.abs((data[o + 1] ?? 0) - colour[1]) <= FLAT_TOLERANCE &&
      Math.abs((data[o + 2] ?? 0) - colour[2]) <= FLAT_TOLERANCE
    )
      near++;
  };
  for (let x = 0; x < width; x++) {
    check(x, 0);
    if (height > 1) check(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    check(0, y);
    if (width > 1) check(width - 1, y);
  }
  return { flat: ring > 0 && near / ring >= FLAT_SHARE, colour };
}

/**
 * Solve the pair into a PNG with real alpha. `src1`/`src2` are the same subject
 * on two flat backgrounds, pixel-aligned; the backgrounds are read off each
 * image's border, never assumed — a model asked for #00ff00 returns (19,201,25).
 */
export async function differenceMatte(
  src1: string,
  src2: string,
  dest: string,
  opts: MatteOptions = {},
): Promise<MatteResult> {
  const floor = opts.floor ?? DEFAULT_FLOOR;
  const ceiling = opts.ceiling ?? DEFAULT_CEILING;
  let a = await decodeRgb(src1);
  const b = await decodeRgb(src2);
  let resized = false;
  if (a.width !== b.width || a.height !== b.height) {
    // An edit backend may return its own native size (grok renders every edit at
    // 1k). Same aspect means a uniform rescale keeps the pair aligned to within
    // resampling error; a different aspect means the subject moved, full stop.
    const aspectGap = Math.abs(a.width / a.height - b.width / b.height);
    if (aspectGap > 0.01) {
      throw new Error(
        `the two renders differ in shape (${a.width}x${a.height} vs ${b.width}x${b.height}); the pair must be pixel-aligned`,
      );
    }
    a = await decodeRgb(src1, { width: b.width, height: b.height });
    resized = true;
  }
  const background1 = borderColour(a);
  const background2 = borderColour(b);
  const backgroundDistance = distance(background1, background2);
  if (backgroundDistance < MIN_DISTANCE) {
    throw new Error(
      `the two backgrounds are too similar to matte (distance ${backgroundDistance.toFixed(0)}, need ≥ ${MIN_DISTANCE}); the edit likely ignored the backdrop instruction`,
    );
  }

  const { width, height } = a;
  const n = width * height;
  const out = Buffer.alloc(n * 4);
  const gap = [0, 1, 2].map(c => (background1[c] ?? 0) - (background2[c] ?? 0));
  const usable = gap.map(g => Math.abs(g) >= CHANNEL_THRESHOLD);
  const denom = gap.reduce((s, g, c) => (usable[c] ? s + g * g : s), 0);
  if (denom === 0) throw new Error('no colour channel separates the two backgrounds');

  let transparent = 0;
  let soft = 0;
  let opaque = 0;
  let drifted = 0;

  for (let i = 0; i < n; i++) {
    const o = i * 3;
    // Least squares over the usable channels: (o1 - o2) = (1 - a)(b1 - b2).
    let num = 0;
    for (let c = 0; c < 3; c++) {
      if (!usable[c]) continue;
      num += ((a.data[o + c] ?? 0) - (b.data[o + c] ?? 0)) * (gap[c] ?? 0);
    }
    let alpha = 1 - num / denom;
    if (alpha <= floor) alpha = 0;
    else if (alpha >= ceiling) alpha = 1;
    alpha = Math.min(1, Math.max(0, alpha));

    const q = i * 4;
    if (alpha === 0) {
      transparent++;
      out[q] = 0;
      out[q + 1] = 0;
      out[q + 2] = 0;
      out[q + 3] = 0;
      continue;
    }
    if (alpha === 1) opaque++;
    else soft++;

    let moved = false;
    for (let c = 0; c < 3; c++) {
      // Foreground from each observation, averaged: F = (obs - (1-a)·B) / a.
      const f1 = (a.data[o + c] ?? 0) - (1 - alpha) * (background1[c] ?? 0);
      const f2 = (b.data[o + c] ?? 0) - (1 - alpha) * (background2[c] ?? 0);
      if (Math.abs(f1 - f2) > DRIFT_STEP) moved = true;
      out[q + c] = Math.round(Math.min(255, Math.max(0, (f1 + f2) / (2 * alpha))));
    }
    if (moved) drifted++;
    out[q + 3] = Math.round(alpha * 255);
  }

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(dest);

  return {
    width,
    height,
    background1,
    background2,
    backgroundDistance,
    transparentRatio: n === 0 ? 0 : transparent / n,
    softRatio: n === 0 ? 0 : soft / n,
    drift: opaque + soft === 0 ? 0 : drifted / (opaque + soft),
    resized,
  };
}
