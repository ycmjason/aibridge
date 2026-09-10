import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { differenceMatte, hasFlatBorder, type Rgb } from './matte.ts';

const W = 64;
const H = 64;
const RED: Rgb = [230, 80, 30];
const WHITE: Rgb = [255, 255, 255];
const GREEN: Rgb = [19, 201, 25];

/** Composite a red square (16..48) with a half-covered ring at x=15 over `bg`. */
function render(bg: Rgb, subject: Rgb = RED, shift = 0): Buffer {
  const buf = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const inside = x >= 16 + shift && x < 48 + shift && y >= 16 && y < 48;
      const edge = x === 15 + shift && y >= 16 && y < 48;
      const a = inside ? 1 : edge ? 0.5 : 0;
      for (let c = 0; c < 3; c++) {
        buf[o + c] = Math.round(a * (subject[c] ?? 0) + (1 - a) * (bg[c] ?? 0));
      }
    }
  }
  return buf;
}

async function write(path: string, buf: Buffer): Promise<void> {
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .png()
    .toFile(path);
}

describe('differenceMatte', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aibridge-matte-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('recovers alpha and foreground colour from a white/green pair', async () => {
    const a = join(dir, 'a.png');
    const b = join(dir, 'b.png');
    const out = join(dir, 'out.png');
    await write(a, render(WHITE));
    await write(b, render(GREEN));

    const r = await differenceMatte(a, b, out);
    expect(r.background1).toEqual(WHITE);
    expect(r.background2).toEqual(GREEN);
    expect(r.backgroundDistance).toBeGreaterThan(300);
    expect(r.drift).toBe(0);
    expect(r.transparentRatio).toBeCloseTo(1 - (32 * 32 + 32) / (W * H), 2);
    expect(r.softRatio).toBeCloseTo(32 / (W * H), 3);

    const { data } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const o = (y * W + x) * 4;
      return [data[o], data[o + 1], data[o + 2], data[o + 3]];
    };
    expect(px(0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(32, 32)).toEqual([...RED, 255]);
    const [er, eg, eb, ea] = px(15, 32);
    expect(ea).toBeGreaterThanOrEqual(124);
    expect(ea).toBeLessThanOrEqual(132);
    expect(Math.abs((er ?? 0) - RED[0])).toBeLessThanOrEqual(3);
    expect(Math.abs((eg ?? 0) - RED[1])).toBeLessThanOrEqual(3);
    expect(Math.abs((eb ?? 0) - RED[2])).toBeLessThanOrEqual(3);
  });

  it('reports drift when the subject moves between renders', async () => {
    const a = join(dir, 'a.png');
    const b = join(dir, 'b.png');
    await write(a, render(WHITE));
    await write(b, render(GREEN, RED, 4));
    const r = await differenceMatte(a, b, join(dir, 'out.png'));
    expect(r.drift).toBeGreaterThan(0.05);
  });

  it('refuses a pair whose backgrounds barely differ', async () => {
    const a = join(dir, 'a.png');
    const b = join(dir, 'b.png');
    await write(a, render(WHITE));
    await write(b, render([250, 250, 250]));
    await expect(differenceMatte(a, b, join(dir, 'out.png'))).rejects.toThrow(/too similar/);
  });

  it('refuses a pair of different sizes', async () => {
    const a = join(dir, 'a.png');
    const b = join(dir, 'b.png');
    await write(a, render(WHITE));
    await sharp(render(GREEN), { raw: { width: W, height: H, channels: 3 } })
      .resize(32, 32)
      .png()
      .toFile(b);
    await expect(differenceMatte(a, b, join(dir, 'out.png'))).rejects.toThrow(/pixel-aligned/);
  });
});

describe('hasFlatBorder', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aibridge-matte-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('accepts a flat backdrop and reads its colour', async () => {
    const p = join(dir, 'flat.png');
    await write(p, render(GREEN));
    const r = await hasFlatBorder(p);
    expect(r.flat).toBe(true);
    expect(r.colour).toEqual(GREEN);
  });

  it('rejects a scene whose border is not one colour', async () => {
    const buf = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      const o = i * 3;
      buf[o] = (i * 37) % 256;
      buf[o + 1] = (i * 91) % 256;
      buf[o + 2] = (i * 13) % 256;
    }
    const p = join(dir, 'scene.png');
    await write(p, buf);
    expect((await hasFlatBorder(p)).flat).toBe(false);
  });
});
