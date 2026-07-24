import { buildCommand } from '@stricli/core';
import { DEFAULT_MODEL, listModelHelpLines } from '../../models.ts';
import { nonEmptyPrompt, positiveIntSeconds } from '../../parsers.ts';
import subagentImpl from './impl.ts';

const fullDescription = [
  'Hands a self-contained prompt to another model and returns its answer.',
  '',
  'Available models (canonical slug):',
  ...listModelHelpLines(),
  `Default: ${DEFAULT_MODEL} (off-budget). The claude-backend slugs are FALLBACKS for`,
  'when the off-budget CLIs are quota-exhausted — they bill your Claude subscription.',
].join('\n');

export const subagent = buildCommand({
  func: subagentImpl,
  parameters: {
    flags: {
      model: {
        kind: 'parsed',
        parse: String,
        optional: true,
        brief: `Model slug to delegate to (default: ${DEFAULT_MODEL})`,
      },
      timeout: {
        kind: 'parsed',
        parse: positiveIntSeconds,
        optional: true,
        brief: 'Max seconds to wait for the backend (default: 600)',
      },
      tools: {
        kind: 'boolean',
        default: true,
        brief: 'Allow delegate model to use tools (use --no-tools to restrict to reasoning only)',
      },
      preflight: {
        kind: 'boolean',
        default: true,
        brief: 'Check model quota before running (use --no-preflight to skip)',
      },
      json: {
        kind: 'boolean',
        withNegated: false,
        brief: 'Emit a machine-readable JSON result (using canonical slug) instead of prose',
      },
    },
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Self-contained task prompt for the delegate model',
          parse: nonEmptyPrompt,
          placeholder: 'prompt',
        },
      ],
    },
  },
  docs: {
    brief: 'Delegate a self-contained task to another model',
    fullDescription,
  },
});
