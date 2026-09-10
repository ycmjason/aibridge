import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { LocalContext } from '../../context.ts';
import { getDriver } from '../../drivers.ts';
import { renderImage } from '../../imageRender.ts';
import { detectInstalled, installedBackends, requireBackend } from '../../installed.ts';
import { differenceMatte, distance, hasFlatBorder, type Rgb } from '../../matte.ts';
import {
  backendModelId,
  formatImageGenModelError,
  formatUnknownModelError,
  resolveModel,
  supportsImageGen,
} from '../../models.ts';
import { alternativeModels, preflightModel, renderPreflightRefusal } from '../../quotaPreflight.ts';

export interface ImageCutoutFlags {
  readonly model: string;
  readonly out: string;
  readonly timeout?: number;
  readonly preflight: boolean;
  readonly json: boolean;
}

/**
 * The second backdrop is whichever of these is farther from the first. Green
 * is the default pair for white: agy returns a white image untouched when asked
 * for black (three prompts, two Gemini versions), and green edits held the
 * subject still on both agy and grok.
 */
const BACKDROPS: ReadonlyArray<{ readonly name: string; readonly hex: string; readonly rgb: Rgb }> =
  [
    { name: 'green', hex: '#00ff00', rgb: [0, 255, 0] },
    { name: 'white', hex: '#ffffff', rgb: [255, 255, 255] },
  ];

/** Above this share of moved pixels the matte ghosts; measured 4% on agy, 7% on grok. */
const DRIFT_WARN = 0.15;

export function isolationPrompt(subject: string): string {
  return (
    `Keep only ${subject}, unchanged: same position, scale, colours, lighting, line work and every visible detail. ` +
    'Remove everything else and replace it with a flat solid pure white (#ffffff) background. ' +
    'Do not move, redraw, resize, or restyle what is kept.'
  );
}

export function backdropPrompt(backdrop: { name: string; hex: string }): string {
  // Short on purpose: the README-length "keep the subject, composition, …" prompt
  // made agy return the input untouched; this one changed the backdrop every time.
  return `Change the background to solid pure ${backdrop.name} ${backdrop.hex}. Keep everything else identical.`;
}

export default async function imageCutout(
  this: LocalContext,
  flags: ImageCutoutFlags,
  image: string,
  subject?: string,
): Promise<void> {
  const fail = (msg: string): void => {
    this.process.stderr.write(`aibridge image-cutout: ${msg}\n`);
    this.process.exitCode = 1;
  };
  const warn = (msg: string): void => {
    this.process.stderr.write(`aibridge image-cutout: ${msg}\n`);
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
      `effort "-${model.effort}" has no effect on image-cutout (the image tool renders, not the chat model); pass the un-suffixed slug "${model.spec.slug}" instead.`,
    );
  }
  if (!/\.png$/i.test(flags.out)) {
    return fail(`--out "${flags.out}" must end in .png — a cutout is a PNG with alpha.`);
  }

  const imagePath = resolve(this.process.cwd(), image);
  if (!existsSync(imagePath)) return fail(`image not found: ${image}`);

  let firstColour: Rgb | undefined;
  if (subject === undefined) {
    let flat: Awaited<ReturnType<typeof hasFlatBorder>>;
    try {
      flat = await hasFlatBorder(imagePath);
    } catch (err) {
      return fail(`cannot read ${image}: ${(err as Error).message}`);
    }
    if (!flat.flat) {
      return fail(
        `the border of ${image} is not one flat colour, so there is no backdrop to matte against. ` +
          `Say what to keep (\`aibridge image-cutout --model ${model.spec.slug} --out ${flags.out} ${image} "the …"\`) ` +
          'and a first edit isolates it onto white, or supply an image that already sits on a flat background.',
      );
    }
    firstColour = flat.colour;
  }

  const timeoutSec = flags.timeout ?? 600;
  const outPath = resolve(this.process.cwd(), flags.out);
  const driver = getDriver(model.spec.backend);
  if (!driver.generateImage) return fail(formatImageGenModelError(inputSlug, model));
  if (
    model.spec.backend !== 'grok' &&
    !(await requireBackend(this, 'image-cutout', model.spec.backend, { imageOnly: true }))
  )
    return;

  if (flags.preflight) {
    const verdict = await preflightModel(model);
    if (!verdict.ok) {
      this.process.stderr.write(
        `${renderPreflightRefusal('image-cutout', verdict, alternativeModels(model, installedBackends(await detectInstalled()), true))}\n`,
      );
      this.process.exitCode = 3;
      return;
    }
    if (verdict.warning) warn(verdict.warning);
  }

  const work = mkdtempSync(join(tmpdir(), 'aibridge-cutout-'));
  try {
    const render = (prompt: string, ref: string) =>
      renderImage(driver, model, {
        prompt,
        workDir: work,
        backendModel: backendModelId(model),
        effort: model.effort,
        aspectRatio: undefined,
        imagePaths: [ref],
        timeoutSec,
      });

    let base = imagePath;
    let calls = 0;
    if (subject !== undefined) {
      const isolated = await render(isolationPrompt(subject), imagePath);
      calls++;
      if (isolated.kind === 'error') return fail(isolated.reason);
      base = join(work, 'isolated.bin');
      copyFileSync(isolated.path, base);
      try {
        firstColour = (await hasFlatBorder(base)).colour;
      } catch (err) {
        return fail(`cannot read the isolated render: ${(err as Error).message}`);
      }
    }
    const first = firstColour ?? [255, 255, 255];
    const backdrop = BACKDROPS.reduce((best, b) =>
      distance(b.rgb, first) > distance(best.rgb, first) ? b : best,
    );

    const edited = await render(backdropPrompt(backdrop), base);
    calls++;
    if (edited.kind === 'error') return fail(edited.reason);
    const second = join(work, 'second.bin');
    copyFileSync(edited.path, second);

    const keyed = join(work, 'cutout.png');
    let matte: Awaited<ReturnType<typeof differenceMatte>>;
    try {
      matte = await differenceMatte(base, second, keyed);
    } catch (err) {
      return fail(`${(err as Error).message}. Re-run; the model's edit is not deterministic.`);
    }

    if (matte.transparentRatio < 0.02) {
      warn(
        `only ${(matte.transparentRatio * 100).toFixed(1)}% of the image came out transparent — the edit likely kept the old backdrop; wrote it anyway.`,
      );
    }
    if (matte.drift > DRIFT_WARN) {
      warn(
        `the subject moved between the two renders (${(matte.drift * 100).toFixed(0)}% of visible pixels disagree); expect ghosting. Re-run, or try another model.`,
      );
    }

    mkdirSync(dirname(outPath), { recursive: true });
    copyFileSync(keyed, outPath);
    const bytes = statSync(outPath).size;

    if (flags.json) {
      this.process.stdout.write(
        `${JSON.stringify({
          out: outPath,
          bytes,
          width: matte.width,
          height: matte.height,
          model: model.spec.slug,
          backend: model.spec.backend,
          calls,
          background1: matte.background1,
          background2: matte.background2,
          backgroundDistance: Math.round(matte.backgroundDistance),
          transparentRatio: round3(matte.transparentRatio),
          softRatio: round3(matte.softRatio),
          drift: round3(matte.drift),
        })}\n`,
      );
    } else {
      const kb = Math.round(bytes / 1024);
      this.process.stdout.write(
        `✓ Wrote ${outPath} (${matte.width}x${matte.height}, ${kb} KB, ${model.spec.slug}, ${calls} render${calls === 1 ? '' : 's'}; ` +
          `transparent ${pct(matte.transparentRatio)}, soft edge ${pct(matte.softRatio)}, drift ${pct(matte.drift)})\n`,
      );
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
