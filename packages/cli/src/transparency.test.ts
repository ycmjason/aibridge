import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chromaKeyToPng, mentionsTransparentBackground } from './transparency.ts';

describe('chromaKeyToPng', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'aibridge-transparency-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('keys the background, keeps the subject', async () => {
    const width = 512;
    const height = 512;
    const buf = Buffer.alloc(width * height * 3);

    // Fill with green background (17, 249, 19)
    for (let i = 0; i < width * height; i++) {
      const offset = i * 3;
      buf[offset] = 17;
      buf[offset + 1] = 249;
      buf[offset + 2] = 19;
    }

    // Solid red (230, 80, 30) square in the center (from 200 to 312)
    for (let y = 200; y < 312; y++) {
      for (let x = 200; x < 312; x++) {
        const offset = (y * width + x) * 3;
        buf[offset] = 230;
        buf[offset + 1] = 80;
        buf[offset + 2] = 30;
      }
    }

    const src = join(tempDir, 'input.png');
    const dest = join(tempDir, 'output.png');

    await sharp(buf, { raw: { width, height, channels: 3 } }).toFile(src);

    const { transparentRatio } = await chromaKeyToPng(src, dest);

    expect(transparentRatio).toBeGreaterThanOrEqual(0.7);
    expect(transparentRatio).toBeLessThanOrEqual(0.99);

    const { data } = await sharp(dest).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // Corner pixel (0, 0) should have alpha 0
    const cornerOffset = (0 * width + 0) * 4;
    expect(data[cornerOffset + 3]).toBe(0);

    // Centre pixel (256, 256) should have alpha 255 and RGB (230, 80, 30)
    const centreOffset = (256 * width + 256) * 4;
    expect(data[centreOffset]).toBe(230);
    expect(data[centreOffset + 1]).toBe(80);
    expect(data[centreOffset + 2]).toBe(30);
    expect(data[centreOffset + 3]).toBe(255);
  });

  it('interior light pixels survive', async () => {
    const width = 512;
    const height = 512;
    const buf = Buffer.alloc(width * height * 3);

    // Fill background with green (17, 249, 19)
    for (let i = 0; i < width * height; i++) {
      const offset = i * 3;
      buf[offset] = 17;
      buf[offset + 1] = 249;
      buf[offset + 2] = 19;
    }

    // Red square (200..312)
    for (let y = 200; y < 312; y++) {
      for (let x = 200; x < 312; x++) {
        const offset = (y * width + x) * 3;
        buf[offset] = 230;
        buf[offset + 1] = 80;
        buf[offset + 2] = 30;
      }
    }

    // White (255, 255, 255) block inside red square (240..270)
    for (let y = 240; y < 270; y++) {
      for (let x = 240; x < 270; x++) {
        const offset = (y * width + x) * 3;
        buf[offset] = 255;
        buf[offset + 1] = 255;
        buf[offset + 2] = 255;
      }
    }

    const src = join(tempDir, 'input.png');
    const dest = join(tempDir, 'output.png');

    await sharp(buf, { raw: { width, height, channels: 3 } }).toFile(src);
    await chromaKeyToPng(src, dest);

    const { data } = await sharp(dest).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const whiteOffset = (255 * width + 255) * 4;
    expect(data[whiteOffset]).toBe(255);
    expect(data[whiteOffset + 1]).toBe(255);
    expect(data[whiteOffset + 2]).toBe(255);
    expect(data[whiteOffset + 3]).toBe(255);
  });

  it('keys a saturated green subject too — the standing cost of chroma keying', async () => {
    const width = 64;
    const height = 64;
    const buf = Buffer.alloc(width * height * 3);

    // Green background (17, 249, 19) with a red square, and a saturated green
    // (40, 200, 60) block deep inside the subject. Dominance is 160/140, far past
    // DOMINANCE — so it keys, wherever it sits. A chroma key cannot tell a green
    // subject from a green backdrop; CHROMA_CLAUSE tells the model not to make one,
    // and codex is the seat for subjects that must be green.
    for (let i = 0; i < width * height; i++) {
      const offset = i * 3;
      buf[offset] = 17;
      buf[offset + 1] = 249;
      buf[offset + 2] = 19;
    }
    for (let y = 16; y < 48; y++) {
      for (let x = 16; x < 48; x++) {
        const offset = (y * width + x) * 3;
        buf[offset] = 230;
        buf[offset + 1] = 80;
        buf[offset + 2] = 30;
      }
    }
    for (let y = 28; y < 36; y++) {
      for (let x = 28; x < 36; x++) {
        const offset = (y * width + x) * 3;
        buf[offset] = 40;
        buf[offset + 1] = 200;
        buf[offset + 2] = 60;
      }
    }

    const src = join(tempDir, 'input.png');
    const dest = join(tempDir, 'output.png');
    await sharp(buf, { raw: { width, height, channels: 3 } }).toFile(src);
    await chromaKeyToPng(src, dest);

    const { data } = await sharp(dest).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[(32 * width + 32) * 4 + 3]).toBe(0); // green block: keyed
    expect(data[(20 * width + 20) * 4 + 3]).toBe(255); // red subject: kept
  });

  it('keeps a mildly green subject (below the dominance threshold) and does not despill it', async () => {
    const width = 512;
    const height = 512;
    const buf = Buffer.alloc(width * height * 3);

    // Fill background with green (17, 249, 19)
    for (let i = 0; i < width * height; i++) {
      const offset = i * 3;
      buf[offset] = 17;
      buf[offset + 1] = 249;
      buf[offset + 2] = 19;
    }

    // Red square (200..312)
    for (let y = 200; y < 312; y++) {
      for (let x = 200; x < 312; x++) {
        const offset = (y * width + x) * 3;
        buf[offset] = 230;
        buf[offset + 1] = 80;
        buf[offset + 2] = 30;
      }
    }

    // Green subject (130, 160, 130) fully inside red square (230..250, >2px from background edge at 200)
    // g - r = 30 (< DOMINANCE 40 so not keyed in pass 1, >= 20 so would be despilled if ungated)
    for (let y = 230; y < 250; y++) {
      for (let x = 230; x < 250; x++) {
        const offset = (y * width + x) * 3;
        buf[offset] = 130;
        buf[offset + 1] = 160;
        buf[offset + 2] = 130;
      }
    }

    const src = join(tempDir, 'input.png');
    const dest = join(tempDir, 'output.png');

    await sharp(buf, { raw: { width, height, channels: 3 } }).toFile(src);
    await chromaKeyToPng(src, dest);

    const { data } = await sharp(dest).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const greenOffset = (240 * width + 240) * 4;
    expect(data[greenOffset]).toBe(130);
    expect(data[greenOffset + 1]).toBe(160);
    expect(data[greenOffset + 2]).toBe(130);
    expect(data[greenOffset + 3]).toBe(255);
  });

  it('fringe is despilled', async () => {
    const width = 512;
    const height = 512;
    const buf = Buffer.alloc(width * height * 3);

    // Fill background with green (17, 249, 19)
    for (let i = 0; i < width * height; i++) {
      const offset = i * 3;
      buf[offset] = 17;
      buf[offset + 1] = 249;
      buf[offset + 2] = 19;
    }

    // Red square interior (201..311)
    for (let y = 201; y < 311; y++) {
      for (let x = 201; x < 311; x++) {
        const offset = (y * width + x) * 3;
        buf[offset] = 230;
        buf[offset + 1] = 80;
        buf[offset + 2] = 30;
      }
    }

    // 1-pixel fringe ring at y=200, y=311, x=200, x=311 with green-tinted (160, 190, 160)
    // where g - r = 30 (>= 20 for despill, < 40 so not keyed)
    for (let x = 200; x <= 311; x++) {
      for (const y of [200, 311]) {
        const offset = (y * width + x) * 3;
        buf[offset] = 160;
        buf[offset + 1] = 190;
        buf[offset + 2] = 160;
      }
    }
    for (let y = 200; y <= 311; y++) {
      for (const x of [200, 311]) {
        const offset = (y * width + x) * 3;
        buf[offset] = 160;
        buf[offset + 1] = 190;
        buf[offset + 2] = 160;
      }
    }

    const src = join(tempDir, 'input.png');
    const dest = join(tempDir, 'output.png');

    await sharp(buf, { raw: { width, height, channels: 3 } }).toFile(src);
    await chromaKeyToPng(src, dest);

    const { data } = await sharp(dest).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // Fringe pixel at (200, 200) was adjacent to keyed background
    const fringeOffset = (200 * width + 200) * 4;
    expect(data[fringeOffset + 3]).toBe(255); // stays opaque
    expect(data[fringeOffset + 1]).toBeLessThanOrEqual(
      Math.max(data[fringeOffset] ?? 0, data[fringeOffset + 2] ?? 0),
    );
    expect(data[fringeOffset + 1]).toBe(160);
  });

  it('handles an image with no green at all', async () => {
    const width = 512;
    const height = 512;
    const buf = Buffer.alloc(width * height * 3);

    // All red (255, 0, 0)
    for (let i = 0; i < width * height; i++) {
      const offset = i * 3;
      buf[offset] = 255;
      buf[offset + 1] = 0;
      buf[offset + 2] = 0;
    }

    const src = join(tempDir, 'input.png');
    const dest = join(tempDir, 'output.png');

    await sharp(buf, { raw: { width, height, channels: 3 } }).toFile(src);
    const { transparentRatio } = await chromaKeyToPng(src, dest);

    expect(transparentRatio).toBe(0);

    const { data } = await sharp(dest).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    for (let i = 0; i < width * height; i++) {
      expect(data[i * 4 + 3]).toBe(255);
    }
  });
});

describe('mentionsTransparentBackground', () => {
  it('matches background phrasing', () => {
    for (const p of [
      'a fox on a transparent background',
      'a fox, transparent backdrop',
      'a fox with no background',
      'a fox without a background',
      'PNG with an alpha channel',
      'shot on a chroma-key stage',
      'chroma key green screen',
    ]) {
      expect(mentionsTransparentBackground(p)).toBe(true);
    }
  });

  it('ignores see-through subjects and unrelated wording', () => {
    for (const p of [
      'a transparent glass bottle',
      'a goldfish in a transparent bowl',
      'frosted transparent plastic packaging',
      'a paper cutout of a fox',
      'transparency and trust, abstract illustration',
    ]) {
      expect(mentionsTransparentBackground(p)).toBe(false);
    }
  });
});
