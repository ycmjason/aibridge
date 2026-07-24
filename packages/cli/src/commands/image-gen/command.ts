import { buildCommand } from '@stricli/core';
import { DEFAULT_IMAGE_GEN, listModelHelpLines } from '../../models.ts';
import { nonEmptyPrompt, positiveIntSeconds } from '../../parsers.ts';
import imageGenImpl from './impl.ts';

const fullDescription = [
  "Renders an image by driving the seat's CLI (codex → gpt-image-2, grok →",
  'Imagine), then verifies the result is a real render before returning it.',
  '',
  'Image-gen seats (canonical slug):',
  ...listModelHelpLines({ imageOnly: true }),
  `Default: ${DEFAULT_IMAGE_GEN} (gpt-image-2 via codex; historical default).`,
].join('\n');

export const imageGen = buildCommand({
  func: imageGenImpl,
  parameters: {
    flags: {
      model: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: `Model slug (default: ${DEFAULT_IMAGE_GEN})`,
      },
      out: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: 'Path to write the image (default: ./aibridge-image.png)',
      },
      size: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief:
          'WIDTHxHEIGHT (codex: each edge ÷16; grok: mapped to aspect_ratio, then optionally resized)',
      },
      image: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: 'Reference image path(s), comma-separated — visual reference',
      },
      quality: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: 'low | medium | high — prompt hint, codex only (default high)',
      },
      timeout: {
        kind: 'parsed',
        parse: positiveIntSeconds,
        optional: true,
        brief: 'Max seconds to wait for the render (default: 600)',
      },
      json: {
        kind: 'boolean',
        withNegated: false,
        brief: 'Emit a machine-readable JSON result instead of prose',
      },
    },
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Description of the image to generate',
          parse: nonEmptyPrompt,
          placeholder: 'prompt',
        },
      ],
    },
  },
  docs: {
    brief: 'Generate a raster image via a model seat',
    fullDescription,
  },
});
