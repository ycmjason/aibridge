import { buildCommand } from '@stricli/core';
import { listModelHelpLines } from '../../models.ts';
import { nonEmptyPrompt, positiveIntSeconds } from '../../parsers.ts';
import subagentImpl from './impl.ts';

const fullDescription = [
  'Hands a self-contained prompt to another model and returns its answer.',
  '',
  'Available models (canonical slug):',
  ...listModelHelpLines(),
  'Recommended first choice: xai-grok/grok-4.6. Whichever seat runs on the same provider as the',
  'agent you orchestrate from is your last resort — it spends the pool you are already burning.',
].join('\n');

export const subagent = buildCommand({
  func: subagentImpl,
  parameters: {
    flags: {
      model: {
        kind: 'parsed',
        parse: String,
        brief: 'Model slug (required) — see the seat list above',
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
