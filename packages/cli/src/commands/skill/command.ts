import { buildCommand } from '@stricli/core';
import type { LocalContext } from '../../context.ts';
import skillImpl from './impl.ts';

function skillCommand(this: LocalContext, _flags: Record<never, never>, topic?: string): void {
  skillImpl.call(this, topic);
}

export const skill = buildCommand({
  func: skillCommand,
  parameters: {
    flags: {},
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Command-specific instructions to append to the router',
          parse: String,
          placeholder: 'topic',
          optional: true,
        },
      ],
    },
  },
  docs: {
    brief: 'Print the canonical agent instructions bundled with this CLI',
  },
});
