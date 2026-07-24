import { buildCommand } from '@stricli/core';
import { listModelHelpLines } from '../../models.ts';
import { nonEmptyPrompt, positiveIntSeconds } from '../../parsers.ts';
import planImpl from './impl.ts';

const fullDescription = [
  'Produce a detailed implementation plan for a task prompt.',
  '',
  'Available models (canonical slug):',
  ...listModelHelpLines(),
].join('\n');

export const plan = buildCommand({
  func: planImpl,
  parameters: {
    flags: {
      model: {
        kind: 'parsed',
        parse: String,
        brief: 'Model slug (required) — see the seat list above',
      },
      out: {
        kind: 'parsed',
        parse: String,
        brief: 'Where to write the plan file (required)',
      },
      timeout: {
        kind: 'parsed',
        parse: positiveIntSeconds,
        optional: true,
        brief: 'Max seconds for planning (default: 1800)',
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
          brief: 'Task prompt to expand into a detailed implementation plan',
          parse: nonEmptyPrompt,
          placeholder: 'task-prompt',
        },
      ],
    },
  },
  docs: {
    brief: 'Produce a detailed implementation plan for a task prompt',
    fullDescription,
  },
});
