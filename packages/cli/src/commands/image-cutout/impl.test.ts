import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LocalContext } from '../../context.ts';
import type { AgentCliDriver, ImageGenRequest, ImageResult } from '../../driver.ts';
import imageCutout, { type ImageCutoutFlags, nearestAspect } from './impl.ts';

const W = 64;
const H = 64;
type Rgb = readonly [number, number, number];
const RED: Rgb = [230, 80, 30];
const WHITE: Rgb = [255, 255, 255];
const GREEN: Rgb = [19, 201, 25];

/** Red square (16..48) over `bg`; `noise` makes the border non-flat. */
function scene(bg: Rgb, noise = false): Buffer {
  const buf = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const inside = x >= 16 && x < 48 && y >= 16 && y < 48;
      for (let c = 0; c < 3; c++) {
        const b = noise ? ((x * 37 + y * 91 + c * 13) % 200) + 20 : (bg[c] ?? 0);
        buf[o + c] = inside ? (RED[c] ?? 0) : b;
      }
    }
  }
  return buf;
}

async function writeImage(path: string, buf: Buffer, size = W): Promise<void> {
  let p = sharp(buf, { raw: { width: W, height: H, channels: 3 } });
  if (size !== W) p = p.resize(size, size, { kernel: 'nearest' });
  await p.png().toFile(path);
}

const ctx = (): { ctx: LocalContext; stderr: () => string; stdout: () => string } => {
  let stderr = '';
  let stdout = '';
  const fake = {
    process: {
      stderr: {
        write: (s: string) => {
          stderr += s;
          return true;
        },
      },
      stdout: {
        write: (s: string) => {
          stdout += s;
          return true;
        },
      },
      cwd: () => '/tmp',
      exitCode: 0,
    },
  };
  return { ctx: fake as unknown as LocalContext, stderr: () => stderr, stdout: () => stdout };
};

/** A renderer that answers each call with the next scripted image, written into the call's workDir. */
function fakeDriver(script: ReadonlyArray<{ buf: Buffer; size?: number }>): {
  driver: AgentCliDriver;
  calls: ImageGenRequest[];
} {
  const calls: ImageGenRequest[] = [];
  const driver: AgentCliDriver = {
    probe: async () => ({ ok: true, version: 'fake' }),
    run: async () => ({ ok: false, kind: 'no-answer', message: 'n/a', exitCode: 1 }),
    generateImage: async (req): Promise<ImageResult> => {
      const step = script[calls.length];
      calls.push(req);
      if (!step) return { kind: 'error', reason: 'script exhausted' };
      const path = join(req.workDir, 'out.png');
      await writeImage(path, step.buf, step.size);
      return { kind: 'ok', path, bytes: 50_000 };
    },
  };
  return { driver, calls };
}

const flags = (over: Partial<ImageCutoutFlags>): ImageCutoutFlags => ({
  // grok: the impl skips the on-PATH probe for it, so no real CLI is touched.
  model: 'xai-grok/grok-4.6',
  out: '/tmp/out.png',
  json: true,
  preflight: false,
  ...over,
});

describe('image-cutout', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aibridge-cutout-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('mattes a flat-background image in one call', async () => {
    const input = join(dir, 'in.png');
    await writeImage(input, scene(WHITE));
    const out = join(dir, 'out.png');
    const { driver, calls } = fakeDriver([{ buf: scene(GREEN) }]);
    const { ctx: c, stdout } = ctx();

    await imageCutout.call(c, flags({ out }), input, undefined, driver);

    expect(c.process.exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.imagePaths).toEqual([input]);
    expect(calls[0]?.prompt).toContain('green #00ff00');
    expect(calls[0]?.aspectRatio).toBe('1:1');
    const json = JSON.parse(stdout());
    expect(json.calls).toBe(1);
    expect(json.drift).toBe(0);
    const { data } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
    expect(data[(32 * W + 32) * 4 + 3]).toBe(255);
  });

  it('isolates a subject first, then edits to green: two calls in separate work dirs', async () => {
    const input = join(dir, 'in.png');
    await writeImage(input, scene(WHITE, true));
    const out = join(dir, 'out.png');
    const { driver, calls } = fakeDriver([{ buf: scene(WHITE) }, { buf: scene(GREEN) }]);
    const { ctx: c } = ctx();

    await imageCutout.call(c, flags({ out }), input, 'the red square', driver);

    expect(c.process.exitCode).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.prompt).toContain('Keep only the red square');
    expect(calls[1]?.imagePaths[0]).not.toBe(input);
    expect(calls[0]?.workDir).not.toBe(calls[1]?.workDir);
  });

  it('refuses a scene with no subject before spending anything', async () => {
    const input = join(dir, 'in.png');
    await writeImage(input, scene(WHITE, true));
    const { driver, calls } = fakeDriver([]);
    const { ctx: c, stderr } = ctx();

    await imageCutout.call(c, flags({}), input, undefined, driver);

    expect(c.process.exitCode).toBe(1);
    expect(stderr()).toContain('not one flat colour');
    expect(calls).toHaveLength(0);
  });

  it('stops after the first call when the model did not isolate onto a flat backdrop', async () => {
    const input = join(dir, 'in.png');
    await writeImage(input, scene(WHITE, true));
    const { driver, calls } = fakeDriver([{ buf: scene(WHITE, true) }, { buf: scene(GREEN) }]);
    const { ctx: c, stderr } = ctx();

    await imageCutout.call(c, flags({}), input, 'the red square', driver);

    expect(c.process.exitCode).toBe(1);
    expect(stderr()).toContain('did not isolate');
    expect(calls).toHaveLength(1);
  });

  it('fails when the second render kept the old backdrop', async () => {
    const input = join(dir, 'in.png');
    await writeImage(input, scene(WHITE));
    const { driver } = fakeDriver([{ buf: scene(WHITE) }]);
    const { ctx: c, stderr } = ctx();

    await imageCutout.call(c, flags({ out: join(dir, 'out.png') }), input, undefined, driver);

    expect(c.process.exitCode).toBe(1);
    expect(stderr()).toContain('too similar');
  });

  it('rescales when the edit comes back at the model’s own size', async () => {
    const input = join(dir, 'in.png');
    await writeImage(input, scene(WHITE));
    const { driver } = fakeDriver([{ buf: scene(GREEN), size: 32 }]);
    const { ctx: c, stdout } = ctx();

    await imageCutout.call(c, flags({ out: join(dir, 'out.png') }), input, undefined, driver);

    expect(c.process.exitCode).toBe(0);
    expect(JSON.parse(stdout()).width).toBe(32);
  });

  it('snaps the input shape to a ratio the edit tool accepts', () => {
    expect(nearestAspect(720, 1280)).toBe('9:16');
    expect(nearestAspect(1024, 1024)).toBe('1:1');
    expect(nearestAspect(1200, 800)).toBe('3:2');
    expect(nearestAspect(1000, 1400)).toBe('3:4');
  });

  it('refuses a non-.png --out', async () => {
    const { driver, calls } = fakeDriver([]);
    const { ctx: c, stderr } = ctx();
    await imageCutout.call(c, flags({ out: '/tmp/x.jpg' }), '/tmp/in.png', undefined, driver);
    expect(stderr()).toContain('must end in .png');
    expect(calls).toHaveLength(0);
  });
});
