import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isNotFound, runCaptured } from '@aibridge/proc';
import type { LocalContext } from '../../context.ts';
import type { ImageResult } from '../../driver.ts';
import { getDriver } from '../../drivers.ts';
import {
  DEFAULT_IMAGE_GEN,
  formatImageGenModelError,
  formatUnknownModelError,
  resolveModel,
  supportsImageGen,
} from '../../models.ts';

export interface ImageGenFlags {
  readonly model?: string;
  readonly out?: string;
  readonly size?: string;
  readonly image?: string;
  readonly quality?: string;
  readonly timeout?: number;
  readonly json: boolean;
}

const MIN_REAL_BYTES_CODEX = 100_000;
const MIN_REAL_BYTES_GROK = 10_000;

export default async function imageGen(
  this: LocalContext,
  flags: ImageGenFlags,
  prompt: string,
): Promise<void> {
  const fail = (msg: string): void => {
    this.process.stderr.write(`aibridge image-gen: ${msg}\n`);
    this.process.exitCode = 1;
  };

  const inputSlug = flags.model ?? DEFAULT_IMAGE_GEN;
  const model = resolveModel(inputSlug);
  if (!model) return fail(formatUnknownModelError(inputSlug));
  if (!supportsImageGen(model)) return fail(formatImageGenModelError(inputSlug, model));

  if (model.spec.backend === 'codex' && model.effort) {
    return fail(
      `effort "-${model.effort}" has no effect on image-gen (gpt-image-2 renders, not the seat model); use ${DEFAULT_IMAGE_GEN}.`,
    );
  }

  const quality = (flags.quality ?? 'high').toLowerCase();
  if (!['low', 'medium', 'high'].includes(quality)) {
    return fail(`invalid --quality "${flags.quality}" (use low | medium | high)`);
  }

  let size: { w: number; h: number } | undefined;
  if (flags.size !== undefined) {
    const m = flags.size.match(/^(\d+)\s*x\s*(\d+)$/i);
    if (!m) return fail(`invalid --size "${flags.size}" (expected e.g. 1024x1024)`);
    size = { w: Number(m[1]), h: Number(m[2]) };
    if (model.spec.backend === 'codex') {
      const constraint = sizeConstraintError(size.w, size.h);
      if (constraint) return fail(`invalid --size ${size.w}x${size.h}: ${constraint}`);
    } else if (size.w < 1 || size.h < 1) {
      return fail(`invalid --size ${size.w}x${size.h}: dimensions must be positive`);
    }
  }

  const timeoutSec = flags.timeout ?? 600;
  const outPath = resolve(this.process.cwd(), flags.out ?? './aibridge-image.png');

  const imagePaths: string[] = [];
  if (flags.image !== undefined) {
    for (const raw of flags.image
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)) {
      const abs = resolve(this.process.cwd(), raw);
      if (!existsSync(abs)) return fail(`reference image not found: ${raw}`);
      imagePaths.push(abs);
    }
  }

  const driver = getDriver(model.spec.backend);
  if (!driver.generateImage) {
    return fail(formatImageGenModelError(inputSlug, model));
  }

  const minBytes = model.spec.backend === 'codex' ? MIN_REAL_BYTES_CODEX : MIN_REAL_BYTES_GROK;
  const work = mkdtempSync(join(tmpdir(), 'aibridge-imagegen-'));

  try {
    let outcome: ImageResult = await driver.generateImage({
      prompt,
      workDir: work,
      backendModel: model.spec.backendModel,
      effort: model.effort,
      quality,
      size,
      imagePaths,
      timeoutSec,
      forceful: false,
      minBytes,
    });

    if (model.spec.backend === 'codex' && outcome.kind === 'suspect') {
      outcome = await driver.generateImage({
        prompt,
        workDir: work,
        backendModel: model.spec.backendModel,
        effort: model.effort,
        quality,
        size,
        imagePaths,
        timeoutSec,
        forceful: true,
        minBytes,
      });
    }

    if (outcome.kind === 'ok' && outcome.bytes < minBytes) {
      outcome = { kind: 'suspect' };
    }

    if (outcome.kind === 'error') return fail(outcome.reason);
    if (outcome.kind === 'suspect') {
      return fail(
        model.spec.backend === 'grok'
          ? 'grok produced no usable image. Check SuperGrok image access and re-run with a simpler prompt.'
          : 'codex produced only a tiny/code-drawn image, not a real gpt-image-2 render. ' +
              'Try --quality high or a clearer, simpler prompt.',
      );
    }

    const local = join(work, 'result.bin');
    copyFileSync(outcome.path, local);

    let dims = imageSize(local);
    if (size && dims && (dims.width !== size.w || dims.height !== size.h)) {
      const resized = await magick([local, '-resize', `${size.w}x${size.h}!`, local]);
      if (resized) {
        dims = imageSize(local) ?? dims;
      } else {
        this.process.stderr.write(
          `aibridge image-gen: rendered ${dims.width}x${dims.height}, wanted ${size.w}x${size.h}, ` +
            'and ImageMagick (magick/convert) is unavailable to resize.\n',
        );
      }
    }

    const outExt = /\.png$/i.test(outPath) ? 'png' : /\.jpe?g$/i.test(outPath) ? 'jpg' : null;
    const actualFmt = pngSize(local) ? 'png' : jpegSize(local) ? 'jpg' : null;
    const needsConvert = outExt !== null && actualFmt !== null && outExt !== actualFmt;
    if (!needsConvert || !(await magick([local, outPath]))) {
      if (needsConvert) {
        this.process.stderr.write(
          `aibridge image-gen: render is ${actualFmt.toUpperCase()} but out path wants ` +
            `${outExt.toUpperCase()}, and ImageMagick (magick/convert) is unavailable to convert; ` +
            'writing the raw bytes as-is.\n',
        );
      }
      copyFileSync(local, outPath);
    }
    const bytes = statSync(outPath).size;

    if (flags.json) {
      this.process.stdout.write(
        `${JSON.stringify({
          out: outPath,
          bytes,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          sizeRequested: flags.size ?? null,
          quality: model.spec.backend === 'codex' ? quality : null,
          model: model.spec.slug,
          backend: model.spec.backend,
          real: true,
        })}\n`,
      );
    } else {
      const kb = Math.round(bytes / 1024);
      const dimStr = dims ? `${dims.width}x${dims.height}, ` : '';
      const qualityStr = model.spec.backend === 'codex' ? `, ${quality} quality` : '';
      this.process.stdout.write(
        `✓ Wrote ${outPath} (${dimStr}${kb} KB${qualityStr}, ${model.spec.slug})\n`,
      );
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function sizeConstraintError(w: number, h: number): string | null {
  if (w % 16 !== 0 || h % 16 !== 0) return 'each edge must be divisible by 16';
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (long / short > 3) return 'aspect ratio must be within 1:3–3:1';
  if (long > 3840) return 'longest edge must be <= 3840px';
  const px = w * h;
  if (px < 655_360 || px > 8_294_400) return 'total pixels must be 655,360–8,294,400';
  return null;
}

function imageSize(path: string): { width: number; height: number } | null {
  return pngSize(path) ?? jpegSize(path);
}

function pngSize(path: string): { width: number; height: number } | null {
  try {
    const fd = openSync(path, 'r');
    const head = Buffer.alloc(24);
    readSync(fd, head, 0, 24, 0);
    closeSync(fd);
    if (head.toString('latin1', 1, 4) !== 'PNG') return null;
    if (head.toString('latin1', 12, 16) !== 'IHDR') return null;
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function jpegSize(path: string): { width: number; height: number } | null {
  try {
    const fd = openSync(path, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    if (n < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < n) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      if (marker === undefined) return null;
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height };
      }
      if (marker === 0xd9 || marker === 0xda) return null;
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  } catch {
    return null;
  }
}

async function magick(args: readonly string[]): Promise<boolean> {
  for (const tool of ['magick', 'convert']) {
    try {
      const r = await runCaptured(tool, [...args], { timeoutMs: 60_000 });
      if (!r.timedOut && r.code === 0) return true;
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
  return false;
}
