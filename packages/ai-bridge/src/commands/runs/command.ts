import { parseArgs } from 'node:util';
import type { LocalContext } from '../../context.ts';
import runsImpl, { type RunsFlags } from './impl.ts';

function help(): string {
  return [
    'ai-bridge runs — Monitor and inspect execution runs',
    '',
    'Lists recent runs, watches active runs, or displays logs for a specific run.',
    '',
    'Usage:',
    '  ai-bridge runs [options]',
    '  ai-bridge runs <id-prefix>',
    '',
    'Options:',
    '  --watch    Watch running runs in real time (refresh every 2s)',
    '  --json     Emit output in JSON Lines format (list mode only)',
    '  -h, --help Show this help',
    '',
  ].join('\n');
}

export async function runRuns(ctx: LocalContext, argv: readonly string[]): Promise<void> {
  let values: {
    watch: boolean;
    json: boolean;
    help: boolean;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        watch: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (err) {
    return fail(ctx, err);
  }

  if (values.help) {
    ctx.process.stdout.write(help());
    return;
  }

  let idPrefix: string | undefined;
  try {
    const [first, ...extra] = positionals;
    if (first !== undefined) {
      idPrefix = first;
    }
    if (extra.length > 0) {
      throw new Error(`unexpected extra argument "${extra[0]}"`);
    }

    if (values.watch && idPrefix !== undefined) {
      throw new Error('cannot specify <id> when using --watch');
    }
    if (values.watch && values.json) {
      throw new Error('cannot specify --json when using --watch');
    }
  } catch (err) {
    return fail(ctx, err);
  }

  const flags: RunsFlags = {
    watch: values.watch,
    json: values.json,
  };

  await runsImpl.call(ctx, flags, idPrefix);
}

function fail(ctx: LocalContext, err: unknown): void {
  ctx.process.stderr.write(`ai-bridge runs: ${err instanceof Error ? err.message : String(err)}\n`);
  ctx.process.exitCode = 2;
}
