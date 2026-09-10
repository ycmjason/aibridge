import { buildCommand } from '@stricli/core';
import { listModelHelpLines } from '../../models.ts';
import { nonEmptyPrompt, positiveIntSeconds } from '../../parsers.ts';
import imageCutoutImpl from './impl.ts';

const fullDescription = [
  'Cuts the background out of an image into a PNG with real, soft alpha.',
  '',
  'The model re-renders the image with only its background changed to a second',
  'flat colour; the two renders are then solved per pixel for alpha and',
  'foreground colour (difference matting). With no subject given, the image',
  'must already sit on one flat colour and the cutout costs one paid call. With',
  'a subject, a first edit isolates it onto flat white (two paid calls).',
  '',
  'Image models (canonical slug):',
  ...listModelHelpLines({ imageOnly: true }),
].join('\n');

export const imageCutout = buildCommand({
  func: imageCutoutImpl,
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
        brief: 'Path to write the PNG (must end in .png)',
      },
      timeout: {
        kind: 'parsed',
        parse: positiveIntSeconds,
        optional: true,
        brief: 'Max seconds to wait for each render (default: 600)',
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
          brief: 'Image to cut out (PNG, JPEG or WebP)',
          parse: String,
          placeholder: 'image',
        },
        {
          brief:
            'What to keep, e.g. "the red car" — omit when the image already has a flat background',
          parse: nonEmptyPrompt,
          placeholder: 'subject',
          optional: true,
        },
      ],
    },
  },
  docs: {
    brief: 'Cut the background out of an image into a PNG with real alpha',
    fullDescription,
  },
});
