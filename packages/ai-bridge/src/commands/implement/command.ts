import { parseArgs } from 'node:util';
import type { LocalContext } from '../../context.ts';
import { DEFAULT_IMPLEMENTER, listModelHelpLines } from '../../models.ts';
import { positiveIntSeconds } from '../../parsers.ts';
import implementImpl, { type ImplementFlags } from './impl.ts';

function help(): string {
  return [
    'ai-bridge implement — Execute an implementation plan',
    '',
    'Reads an implementation plan file and delegates execution to a model.',
    'Available models (canonical slug):',
    ...listModelHelpLines(),
    '',
    'Usage: ai-bridge implement [options] <plan-file>',
    '',
    'Options:',
    `  --model <slug>       Model slug (default: ${DEFAULT_IMPLEMENTER})`,
    '  --timeout <secs>     Max seconds for implementation (default: 1800)',
    '  --no-preflight       Skip the backend quota preflight check',
    '  -h, --help           Show this help',
    '',
  ].join('\n');
}

export async function runImplement(ctx: LocalContext, argv: readonly string[]): Promise<void> {
  let values: {
    model?: string;
    preflight?: boolean;
    'no-preflight'?: boolean;
    timeout?: string;
    help: boolean;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        model: { type: 'string' },
        preflight: { type: 'boolean' },
        'no-preflight': { type: 'boolean' },
        timeout: { type: 'string' },
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

  let planFile: string;
  let timeout: number | undefined;
  try {
    const [first, ...extra] = positionals;
    if (first === undefined) throw new Error('missing <plan-file> argument');
    if (extra.length > 0) throw new Error(`unexpected extra argument "${extra[0]}"`);
    planFile = first;
    timeout = values.timeout === undefined ? undefined : positiveIntSeconds(values.timeout);
  } catch (err) {
    return fail(ctx, err);
  }

  const flags: ImplementFlags = {
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    preflight: values['no-preflight'] !== true,
  };

  await implementImpl.call(ctx, flags, planFile);
}

function fail(ctx: LocalContext, err: unknown): void {
  ctx.process.stderr.write(
    `ai-bridge implement: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  ctx.process.exitCode = 2;
}
