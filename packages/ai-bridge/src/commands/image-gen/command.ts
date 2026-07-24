import { parseArgs } from 'node:util';
import type { LocalContext } from '../../context.ts';
import { DEFAULT_IMAGE_GEN, listModelHelpLines } from '../../models.ts';
import { nonEmptyPrompt, positiveIntSeconds } from '../../parsers.ts';
import imageGenImpl, { type ImageGenFlags } from './impl.ts';

function help(): string {
  return [
    'ai-bridge image-gen — Generate a raster image via a model seat',
    '',
    "Renders an image by driving the seat's CLI (codex → gpt-image-2, grok →",
    'Imagine), then verifies the result is a real render before returning it.',
    '',
    'Image-gen seats (canonical slug):',
    ...listModelHelpLines({ imageOnly: true }),
    `Default: ${DEFAULT_IMAGE_GEN} (gpt-image-2 via codex; historical default).`,
    '',
    'Usage: ai-bridge image-gen [options] <prompt>',
    '',
    'Options:',
    `  --model <slug>     Model slug (default: ${DEFAULT_IMAGE_GEN})`,
    '  --out <path>       Path to write the image (default: ./ai-bridge-image.png)',
    '  --size <WxH>       WIDTHxHEIGHT (codex: each edge ÷16; grok: mapped to',
    '                     aspect_ratio, then optionally resized)',
    '  --image <paths>    Reference image path(s), comma-separated — visual',
    '                     reference (keep the same subject/identity, restyle, edit)',
    '  --quality <level>  low | medium | high (codex/gpt-image-2; default high).',
    '                     Ignored on grok (Imagine has no quality tier).',
    '  --timeout <secs>   Max seconds to wait for the render (default: 600)',
    '  --json             Emit a machine-readable JSON result instead of prose',
    '  -h, --help         Show this help',
    '',
  ].join('\n');
}

export async function runImageGen(ctx: LocalContext, argv: readonly string[]): Promise<void> {
  let values: {
    model?: string;
    out?: string;
    size?: string;
    image?: string;
    quality?: string;
    timeout?: string;
    json: boolean;
    help: boolean;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        model: { type: 'string' },
        out: { type: 'string' },
        size: { type: 'string' },
        image: { type: 'string' },
        quality: { type: 'string' },
        timeout: { type: 'string' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (err) {
    return fail(ctx, err);
  }

  if (values.help) {
    ctx.process.stdout.write(help());
    return;
  }

  let prompt: string;
  let timeout: number | undefined;
  try {
    const [first, ...extra] = positionals;
    if (first === undefined) throw new Error('missing <prompt> argument');
    if (extra.length > 0) throw new Error(`unexpected extra argument "${extra[0]}"`);
    prompt = nonEmptyPrompt(first);
    timeout = values.timeout === undefined ? undefined : positiveIntSeconds(values.timeout);
  } catch (err) {
    return fail(ctx, err);
  }

  const flags: ImageGenFlags = {
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(values.out !== undefined ? { out: values.out } : {}),
    ...(values.size !== undefined ? { size: values.size } : {}),
    ...(values.image !== undefined ? { image: values.image } : {}),
    ...(values.quality !== undefined ? { quality: values.quality } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    json: values.json,
  };

  await imageGenImpl.call(ctx, flags, prompt);
}

function fail(ctx: LocalContext, err: unknown): void {
  ctx.process.stderr.write(
    `ai-bridge image-gen: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  ctx.process.exitCode = 2;
}
