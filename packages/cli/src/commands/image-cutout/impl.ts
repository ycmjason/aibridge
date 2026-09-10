import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { LocalContext } from '../../context.ts';
import type { AgentCliDriver } from '../../driver.ts';
import { getDriver } from '../../drivers.ts';
import { renderImage } from '../../imageRender.ts';
import { detectInstalled, installedBackends, requireBackend } from '../../installed.ts';
import { differenceMatte, distance, hasFlatBorder, imageAspect, type Rgb } from '../../matte.ts';
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

/**
 * agy's generate_image accepts only these; grok infers the ratio from a single
 * reference and codex takes it as a prompt hint. Without it agy re-composes a
 * 9:16 input into a square and the pair no longer lines up.
 */
const ASPECTS: ReadonlyArray<readonly [string, number]> = [
  ['1:1', 1],
  ['2:3', 2 / 3],
  ['3:2', 3 / 2],
  ['3:4', 3 / 4],
  ['4:3', 4 / 3],
  ['9:16', 9 / 16],
  ['16:9', 16 / 9],
];

/** The pair must line up to within this; a 1% stretch at 1k is ~10 px of squash, already drift. */
const ASPECT_TOLERANCE = 0.01;

export function nearestAspect(width: number, height: number): string {
  const r = width / height;
  return ASPECTS.reduce((best, a) => (Math.abs(a[1] - r) < Math.abs(best[1] - r) ? a : best))[0];
}

/** The named ratio the image already has, or undefined when it is off the list. */
export function exactAspect(width: number, height: number): string | undefined {
  const r = width / height;
  return ASPECTS.find(a => Math.abs(a[1] - r) <= ASPECT_TOLERANCE)?.[0];
}

function isolationPrompt(subject: string): string {
  return (
    `Keep only ${subject}, unchanged: same position, scale, colours, lighting, line work and every visible detail. ` +
    'Remove everything else and replace it with a flat solid pure white (#ffffff) background. ' +
    'Do not move, redraw, resize, or restyle what is kept.'
  );
}

function backdropPrompt(backdrop: { name: string; hex: string }): string {
  // Short on purpose: the README-length "keep the subject, composition, …" prompt
  // made agy return the input untouched; this one changed the backdrop every time.
  return `Change the background to solid pure ${backdrop.name} ${backdrop.hex}. Keep everything else identical.`;
}

export default async function imageCutout(
  this: LocalContext,
  flags: ImageCutoutFlags,
  image: string,
  subject?: string,
  /** Test seam: stricli never passes this; tests inject a fake renderer. */
  driverOverride?: AgentCliDriver,
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
    // agy re-renders every edit at one of its named ratios, so an off-list input
    // can never come back the same shape and the pair would be refused after
    // the render was paid for. grok keeps a single reference's shape; codex is
    // untested here and gets no hint either way.
    if (model.spec.backend === 'agy') {
      let size: { width: number; height: number };
      try {
        size = await imageAspect(imagePath);
      } catch (err) {
        return fail(`cannot read ${image}: ${(err as Error).message}`);
      }
      if (exactAspect(size.width, size.height) === undefined) {
        return fail(
          `${image} is ${size.width}x${size.height}, and ${model.spec.slug} re-renders edits only at ${ASPECTS.map(a => a[0]).join(', ')}, so the pair could not line up. ` +
            'Crop or pad it to one of those first, give a subject so both renders are model output, or use a grok model, which keeps the input shape.',
        );
      }
    }
  }

  const timeoutSec = flags.timeout ?? 600;
  const outPath = resolve(this.process.cwd(), flags.out);
  const driver = driverOverride ?? getDriver(model.spec.backend);
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
    // Each paid render gets its own directory: codex writes a fixed `out.png` and
    // would hand back the previous pass's file if the next one failed to overwrite it.
    // The isolation render may reframe (it is model output either way), so it
    // gets the nearest named ratio. The backdrop render must keep the base's
    // shape exactly, so it gets a ratio only when the base already has one.
    const render = async (prompt: string, ref: string, snap: boolean) => {
      let size: { width: number; height: number };
      try {
        size = await imageAspect(ref);
      } catch (err) {
        return { kind: 'error' as const, reason: `cannot read ${ref}: ${(err as Error).message}` };
      }
      return renderImage(driver, model, {
        prompt,
        workDir: mkdtempSync(join(work, 'render-')),
        backendModel: backendModelId(model),
        effort: model.effort,
        aspectRatio: snap
          ? nearestAspect(size.width, size.height)
          : exactAspect(size.width, size.height),
        imagePaths: [ref],
        timeoutSec,
      });
    };

    let base = imagePath;
    let calls = 0;
    if (subject !== undefined) {
      const isolated = await render(isolationPrompt(subject), imagePath, true);
      calls++;
      if (isolated.kind === 'error') return fail(isolated.reason);
      base = join(work, 'isolated.bin');
      copyFileSync(isolated.path, base);
      let flat: Awaited<ReturnType<typeof hasFlatBorder>>;
      try {
        flat = await hasFlatBorder(base);
      } catch (err) {
        return fail(`cannot read the isolated render: ${(err as Error).message}`);
      }
      // Refuse here rather than after the second paid call: a non-flat first
      // render cannot be matted no matter what the second one looks like.
      if (!flat.flat) {
        return fail(
          'the model did not isolate the subject onto a flat background, so there is nothing to matte against. Re-run, or describe the subject more precisely.',
        );
      }
      firstColour = flat.colour;
    }
    const first = firstColour ?? [255, 255, 255];
    const backdrop = BACKDROPS.reduce((best, b) =>
      distance(b.rgb, first) > distance(best.rgb, first) ? b : best,
    );

    const edited = await render(backdropPrompt(backdrop), base, false);
    calls++;
    if (edited.kind === 'error') return fail(edited.reason);
    const second = join(work, 'second.bin');
    copyFileSync(edited.path, second);
    try {
      if (!(await hasFlatBorder(second)).flat) {
        return fail(
          'the model did not return a flat backdrop on the second render, so the pair cannot be solved. Re-run; the edit is not deterministic.',
        );
      }
    } catch (err) {
      return fail(`cannot read the second render: ${(err as Error).message}`);
    }

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
          resized: matte.resized,
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
