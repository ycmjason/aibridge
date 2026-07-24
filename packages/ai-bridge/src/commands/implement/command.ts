import { buildCommand } from '@stricli/core';
import { DEFAULT_IMPLEMENTER, listModelHelpLines } from '../../models.ts';
import { positiveIntSeconds } from '../../parsers.ts';
import implementImpl from './impl.ts';

const fullDescription = [
  'Reads an implementation plan file and delegates execution to a model.',
  '',
  'Available models (canonical slug):',
  ...listModelHelpLines(),
].join('\n');

export const implement = buildCommand({
  func: implementImpl,
  parameters: {
    flags: {
      model: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: `Model slug (default: ${DEFAULT_IMPLEMENTER})`,
      },
      timeout: {
        kind: 'parsed',
        parse: positiveIntSeconds,
        optional: true,
        brief: 'Max seconds for implementation (default: 1800)',
      },
      preflight: {
        kind: 'boolean',
        default: true,
        brief: 'Check model quota before running (use --no-preflight to skip)',
      },
    },
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Path to the plan file to implement',
          parse: String,
          placeholder: 'plan-file',
        },
      ],
    },
  },
  docs: {
    brief: 'Execute an implementation plan',
    fullDescription,
  },
});
