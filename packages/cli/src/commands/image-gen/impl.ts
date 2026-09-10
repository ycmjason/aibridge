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
import type { LocalContext } from '../../context.ts';
import { getDriver } from '../../drivers.ts';
import { renderImage } from '../../imageRender.ts';
import { detectInstalled, installedBackends, requireBackend } from '../../installed.ts';
import {
  backendModelId,
  formatImageGenModelError,
  formatUnknownModelError,
  imageAlphaFor,
  imageFormatFor,
  resolveModel,
  supportsImageGen,
} from '../../models.ts';
import { alternativeModels, preflightModel, renderPreflightRefusal } from '../../quotaPreflight.ts';

export interface ImageGenFlags {
  readonly model: string;
  readonly out: string;
  readonly aspectRatio?: string;
  readonly image?: string;
  readonly timeout?: number;
  readonly preflight: boolean;
  readonly json: boolean;
}

/**
 * Background-scoped only. `transparent` on its own describes subjects far more
 * often than backdrops ("transparent glass bottle", "goldfish in a transparent
 * bowl"), and those are ordinary briefs on every model.
 */
const TRANSPARENT_BACKGROUND =
  /\b(transparent (background|backdrop)|no background|without a background|alpha channel|chroma[- ]?key)/i;

/** Does the prompt ask for a see-through *background* (as opposed to a see-through subject)? */
export function mentionsTransparentBackground(prompt: string): boolean {
  return TRANSPARENT_BACKGROUND.test(prompt);
}

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
  if (!model) {
    return fail(formatUnknownModelError(inputSlug, installedBackends(await detectInstalled())));
  }
  if (!supportsImageGen(model)) {
    return fail(
      formatImageGenModelError(inputSlug, model, installedBackends(await detectInstalled())),
    );
  }

  if (model.spec.backend === 'codex' && model.effort) {
    return fail(
      `effort "-${model.effort}" has no effect on image-gen (the image tool renders, not the chat model); pass the un-suffixed slug "${model.spec.slug}" instead.`,
    );
  }

  const expected = imageFormatFor(model);
  const alpha = imageAlphaFor(model);
  if (expected === undefined || alpha === undefined) {
    return fail(formatImageGenModelError(inputSlug, model));
  }

  const label = expected === 'png' ? 'PNG' : 'JPEG';
  const extValid = expected === 'png' ? /\.png$/i.test(flags.out) : /\.jpe?g$/i.test(flags.out);
  if (!extValid) {
    return fail(
      `--out "${flags.out}" must end in ${expected === 'png' ? '.png' : '.jpg or .jpeg'} — the ${model.spec.slug} model renders ${label} and aibridge does not convert.`,
    );
  }

  // Two refusals that save a paid render which cannot come back with alpha.
  if (mentionsTransparentBackground(prompt)) {
    const cutout = `render it on a flat solid white background, then run \`aibridge image-cutout --model ${model.spec.slug} --out <file>.png <that render>\``;
    if (alpha === 'cutout') {
      return fail(
        `the prompt asks for a transparent background but the ${model.spec.slug} model renders ${label} with no alpha — ${cutout}.`,
      );
    }
    if (flags.image !== undefined) {
      return fail(
        `the prompt asks for a transparent background with a reference attached, and ${model.spec.slug} paints a fake checkerboard instead of alpha in that case — drop --image, or ${cutout}.`,
      );
    }
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
  // The grok model renders over HTTP on ~/.grok/auth.json and only spawns the CLI
  // to refresh a token, so a missing `grok` binary is not a reason to refuse.
  if (
    model.spec.backend !== 'grok' &&
    !(await requireBackend(this, 'image-gen', model.spec.backend, { imageOnly: true }))
  )
    return;

  // Last gate before a paid render. Every check above is local and must stay
  // above it, so a bad --out or aspect ratio still fails without a network call.
  if (flags.preflight) {
    const verdict = await preflightModel(model);
    if (!verdict.ok) {
      this.process.stderr.write(
        `${renderPreflightRefusal('image-gen', verdict, alternativeModels(model, installedBackends(await detectInstalled()), true))}\n`,
      );
      this.process.exitCode = 3;
      return;
    }
    if (verdict.warning) this.process.stderr.write(`aibridge image-gen: ${verdict.warning}\n`);
  }

  const work = mkdtempSync(join(tmpdir(), 'aibridge-imagegen-'));

  try {
    const outcome = await renderImage(driver, model, {
      prompt,
      workDir: work,
      backendModel: backendModelId(model),
      effort: model.effort,
      aspectRatio,
      imagePaths,
      timeoutSec,
    });
    if (outcome.kind === 'error') return fail(outcome.reason);

    const local = join(work, 'result.bin');
    copyFileSync(outcome.path, local);

    const dims = imageSize(local);
    const actual = pngSize(local) ? 'png' : jpegSize(local) ? 'jpg' : null;

    // ponytail: guard for a backend changing formats in the future without throwing away a paid render
    if (actual !== null && actual !== expected) {
      this.process.stderr.write(
        `aibridge image-gen: expected a ${label} render from this model but got ${actual === 'png' ? 'PNG' : 'JPEG'}; wrote the raw bytes to ${outPath} anyway — the extension does not match the contents.\n`,
      );
    }

    // The render is already paid for — don't lose it to a missing --out directory.
    mkdirSync(dirname(outPath), { recursive: true });
    copyFileSync(local, outPath);
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
          real: true,
        })}\n`,
      );
    } else {
      const kb = Math.round(bytes / 1024);
      const dimStr = dims ? `${dims.width}x${dims.height}, ` : '';
      this.process.stdout.write(`✓ Wrote ${outPath} (${dimStr}${kb} KB, ${model.spec.slug})\n`);
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
