import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import type { LocalContext } from '../../context.ts';
import type { ImageResult } from '../../driver.ts';
import { getDriver } from '../../drivers.ts';
import {
  backendModelId,
  formatImageGenModelError,
  formatUnknownModelError,
  type ImageFormat,
  imageAlphaFor,
  imageFormatFor,
  resolveModel,
  supportsImageGen,
} from '../../models.ts';
import { CHROMA_CLAUSE, chromaKeyToPng, NATIVE_ALPHA_CLAUSE } from '../../transparency.ts';

export interface ImageGenFlags {
  readonly model: string;
  readonly out: string;
  readonly aspectRatio?: string;
  readonly image?: string;
  readonly timeout?: number;
  readonly json: boolean;
  readonly transparent: boolean;
}

const MIN_REAL_BYTES_CODEX = 100_000;
const MIN_REAL_BYTES_TOOL = 10_000;

export default async function imageGen(
  this: LocalContext,
  flags: ImageGenFlags,
  prompt: string,
): Promise<void> {
  const fail = (msg: string): void => {
    this.process.stderr.write(`aibridge image-gen: ${msg}\n`);
    this.process.exitCode = 1;
  };

  const inputSlug = flags.model;
  const model = resolveModel(inputSlug);
  if (!model) return fail(formatUnknownModelError(inputSlug));
  if (!supportsImageGen(model)) return fail(formatImageGenModelError(inputSlug, model));

  if (model.spec.backend === 'codex' && model.effort) {
    return fail(
      `effort "-${model.effort}" has no effect on image-gen (the image tool renders, not the seat model); pass the un-suffixed slug "${model.spec.slug}" instead.`,
    );
  }

  const expected = imageFormatFor(model);
  if (expected === undefined) return fail(formatImageGenModelError(inputSlug, model));

  const alpha = imageAlphaFor(model);
  if (alpha === undefined) return fail(formatImageGenModelError(inputSlug, model));

  const outFormat: ImageFormat = flags.transparent ? 'png' : expected;
  const label = outFormat === 'png' ? 'PNG' : 'JPEG';
  const extValid = outFormat === 'png' ? /\.png$/i.test(flags.out) : /\.jpe?g$/i.test(flags.out);
  if (!extValid) {
    const reason =
      flags.transparent && expected === 'jpg'
        ? '--transparent always writes PNG'
        : `the ${model.spec.slug} seat renders ${label} and aibridge does not convert`;
    return fail(
      `--out "${flags.out}" must end in ${outFormat === 'png' ? '.png' : '.jpg or .jpeg'} — ${reason}.`,
    );
  }

  const ASKS_FOR_ALPHA =
    /\b(transparent|transparency|alpha channel|no background|without a background|cut-?out|chroma[- ]?key)\b/i;
  if (!flags.transparent && alpha === 'chroma' && ASKS_FOR_ALPHA.test(prompt)) {
    return fail(
      `the prompt asks for a transparent background but the ${model.spec.slug} seat cannot render alpha — ` +
        `pass --transparent (aibridge chroma-keys it locally, binary edges) or use a native-alpha seat ` +
        `(openai-codex/*). Re-run with --transparent to proceed.`,
    );
  }

  let aspectRatio: string | undefined;
  if (flags.aspectRatio !== undefined) {
    const m = flags.aspectRatio.match(/^(\d+)\s*:\s*(\d+)$/);
    if (!m || Number(m[1]) < 1 || Number(m[2]) < 1) {
      return fail(`invalid --aspect-ratio "${flags.aspectRatio}" (expected e.g. 16:9)`);
    }
    aspectRatio = `${Number(m[1])}:${Number(m[2])}`;
  }

  const timeoutSec = flags.timeout ?? 600;
  const outPath = resolve(this.process.cwd(), flags.out);

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

  const minBytes = model.spec.backend === 'codex' ? MIN_REAL_BYTES_CODEX : MIN_REAL_BYTES_TOOL;
  const work = mkdtempSync(join(tmpdir(), 'aibridge-imagegen-'));

  const effectivePrompt = flags.transparent
    ? `${prompt}\n\n${alpha === 'chroma' ? CHROMA_CLAUSE : NATIVE_ALPHA_CLAUSE}`
    : prompt;

  try {
    let outcome: ImageResult = await driver.generateImage({
      prompt: effectivePrompt,
      workDir: work,
      backendModel: backendModelId(model),
      effort: model.effort,
      aspectRatio,
      imagePaths,
      timeoutSec,
      forceful: false,
      minBytes,
    });

    if (model.spec.backend === 'codex' && outcome.kind === 'suspect') {
      outcome = await driver.generateImage({
        prompt: effectivePrompt,
        workDir: work,
        backendModel: backendModelId(model),
        effort: model.effort,
        aspectRatio,
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
        model.spec.backend === 'agy'
          ? 'agy produced no usable image. Re-run with a simpler prompt, or check Antigravity image access.'
          : model.spec.backend === 'grok'
            ? 'grok produced no usable image. Check SuperGrok image access and re-run with a simpler prompt.'
            : 'codex produced only a tiny/code-drawn image, not a real render. ' +
              'Try a clearer, simpler prompt.',
      );
    }

    const local = join(work, 'result.bin');
    copyFileSync(outcome.path, local);

    let artefact = local;
    let transparency: 'native' | 'chroma' | null = null;
    if (flags.transparent) {
      const meta = await sharp(local).metadata();
      const alreadyAlpha = meta.hasAlpha === true;
      if (alreadyAlpha) {
        transparency = 'native';
      } else {
        const keyed = join(work, 'keyed.png');
        const { transparentRatio } = await chromaKeyToPng(local, keyed);
        transparency = 'chroma';
        if (transparentRatio < 0.02) {
          this.process.stderr.write(
            `aibridge image-gen: --transparent keyed only ${(transparentRatio * 100).toFixed(1)}% of the image — ` +
              `the model likely ignored the chroma-key instruction; wrote it anyway. Re-run, or use a native-alpha seat.\n`,
          );
        }
        artefact = keyed;
      }
    }

    const dims = imageSize(artefact);
    const actual = pngSize(artefact) ? 'png' : jpegSize(artefact) ? 'jpg' : null;

    // ponytail: guard for a backend changing formats in the future without throwing away a paid render
    if (actual !== null && actual !== outFormat) {
      this.process.stderr.write(
        `aibridge image-gen: expected a ${label} render from this seat but got ${actual === 'png' ? 'PNG' : 'JPEG'}; wrote the raw bytes to ${outPath} anyway — the extension does not match the contents.\n`,
      );
    }

    // The render is already paid for — don't lose it to a missing --out directory.
    mkdirSync(dirname(outPath), { recursive: true });
    copyFileSync(artefact, outPath);
    const bytes = statSync(outPath).size;

    if (flags.json) {
      this.process.stdout.write(
        `${JSON.stringify({
          out: outPath,
          bytes,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          aspectRatio: flags.aspectRatio ?? null,
          model: model.spec.slug,
          backend: model.spec.backend,
          transparency,
          real: true,
        })}\n`,
      );
    } else {
      const kb = Math.round(bytes / 1024);
      const dimStr = dims ? `${dims.width}x${dims.height}, ` : '';
      const transparencyStr = flags.transparent
        ? `, transparency: ${transparency === 'native' ? 'native alpha' : 'chroma-keyed'}`
        : '';
      this.process.stdout.write(
        `✓ Wrote ${outPath} (${dimStr}${kb} KB, ${model.spec.slug}${transparencyStr})\n`,
      );
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
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
