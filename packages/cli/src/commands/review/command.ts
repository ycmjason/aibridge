import { buildCommand } from '@stricli/core';
import { DEFAULT_MODEL, listModelHelpLines } from '../../models.ts';
import { positiveIntSeconds } from '../../parsers.ts';
import reviewImpl from './impl.ts';

const fullDescription = [
  'Inspects code diffs or plan contracts and writes a review report.',
  '',
  'Available models (canonical slug):',
  ...listModelHelpLines(),
].join('\n');

export const review = buildCommand({
  func: reviewImpl,
  parameters: {
    flags: {
      model: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: `Model slug (default: ${DEFAULT_MODEL})`,
      },
      plan: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: 'Plan file for contract / over-reach check',
      },
      base: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: 'Base git ref to diff against (default: HEAD)',
      },
      out: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: 'Where to write the review report (default: <run.dir>/review.md)',
      },
      timeout: {
        kind: 'parsed',
        parse: positiveIntSeconds,
        optional: true,
        brief: 'Max seconds for review (default: 1200)',
      },
      preflight: {
        kind: 'boolean',
        default: true,
        brief: 'Check model quota before running (use --no-preflight to skip)',
      },
    },
  },
  docs: {
    brief: 'Review working tree diff or plan contract',
    fullDescription,
  },
});
