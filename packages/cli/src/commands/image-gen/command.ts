import { buildCommand } from '@stricli/core';
import { DEFAULT_IMAGE_GEN, listModelHelpLines } from '../../models.ts';
import { nonEmptyPrompt, positiveIntSeconds } from '../../parsers.ts';
import imageGenImpl from './impl.ts';

const fullDescription = [
  "Renders an image by driving the seat's own CLI, then verifies the result is",
  'a real render before returning it.',
  '',
  'Image-gen seats (canonical slug):',
  ...listModelHelpLines({ imageOnly: true }),
  `Default: ${DEFAULT_IMAGE_GEN}.`,
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
        brief:
          'Path to write the image — extension must match the seat format (.png for codex, .jpg for agy/grok)',
      },
      aspectRatio: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: 'Aspect ratio N:M, e.g. 16:9 (agy/grok: real tool param; codex: prompt hint)',
      },
      image: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: 'Reference image path(s), comma-separated — visual reference',
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
