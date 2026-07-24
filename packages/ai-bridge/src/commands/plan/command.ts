import { buildCommand } from '@stricli/core';
import { DEFAULT_MODEL, listModelHelpLines } from '../../models.ts';
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
        optional: true,
        brief: `Model slug (default: ${DEFAULT_MODEL})`,
      },
      out: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: 'Where to write the plan (default: <run.dir>/plan.md)',
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
