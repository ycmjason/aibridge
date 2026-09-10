import { buildCommand } from '@stricli/core';
import { listModelHelpLines } from '../../models.ts';
import { nonEmptyPrompt, positiveIntSeconds } from '../../parsers.ts';
import imageGenImpl from './impl.ts';

const fullDescription = [
  "Renders an image by driving the model's own CLI, then verifies the result is",
  "a real render before returning it. The file is the model's own bytes; for a",
  'transparent PNG from a JPEG model, render on flat white and run image-cutout.',
  '',
  'Image-gen models (canonical slug):',
  ...listModelHelpLines({ imageOnly: true }),
  'Recommended model: openai-codex/gpt-5.6-sol.',
].join('\n');

export const imageGen = buildCommand({
  func: imageGenImpl,
  parameters: {
    flags: {
      model: {
        kind: 'parsed',
        parse: String,
        brief: 'Model slug (required) — see the model list above',
      },
      out: {
        kind: 'parsed',
        parse: String,
        brief:
          'Path to write the image — extension must match the model format (.png for codex, .jpg for agy/grok)',
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
      preflight: {
        kind: 'boolean',
        default: true,
        brief: 'Check model quota before rendering (use --no-preflight to skip)',
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
    brief: 'Generate a raster image via a model',
    fullDescription,
  },
});
