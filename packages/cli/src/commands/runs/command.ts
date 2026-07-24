import { buildCommand } from '@stricli/core';
import type { LocalContext } from '../../context.ts';
import runsImpl, { type RunsFlags } from './impl.ts';

const fullDescription =
  'Lists recent runs, watches active runs, or displays logs for a specific run.';

async function runsCommand(this: LocalContext, flags: RunsFlags, idPrefix?: string): Promise<void> {
  if (flags.watch && idPrefix !== undefined) {
    this.process.stderr.write('aibridge runs: cannot specify <id> when using --watch\n');
    this.process.exitCode = 2;
    return;
  }
  if (flags.watch && flags.json) {
    this.process.stderr.write('aibridge runs: cannot specify --json when using --watch\n');
    this.process.exitCode = 2;
    return;
  }
  await runsImpl.call(this, flags, idPrefix);
}

export const runs = buildCommand({
  func: runsCommand,
  parameters: {
    flags: {
      watch: {
        kind: 'boolean',
        withNegated: false,
        brief: 'Watch running runs in real time (refresh every 2s)',
      },
      json: {
        kind: 'boolean',
        withNegated: false,
        brief: 'Emit output in JSON Lines format (list mode only)',
      },
    },
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Run id prefix to inspect (defaults to listing recent runs)',
          parse: String,
          placeholder: 'id-prefix',
          optional: true,
        },
      ],
    },
  },
  docs: {
    brief: 'Monitor and inspect execution runs',
    fullDescription,
  },
});
