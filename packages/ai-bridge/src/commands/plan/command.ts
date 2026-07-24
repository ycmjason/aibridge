import { parseArgs } from 'node:util';
import type { LocalContext } from '../../context.ts';
import { DEFAULT_MODEL, listModelHelpLines } from '../../models.ts';
import { nonEmptyPrompt, positiveIntSeconds } from '../../parsers.ts';
import planImpl, { type PlanFlags } from './impl.ts';

function help(): string {
  return [
    'ai-bridge plan — Produce a detailed implementation plan for a task prompt',
    '',
    'Hands a task prompt to a model to produce an expanded implementation plan file.',
    'Available models (canonical slug):',
    ...listModelHelpLines(),
    '',
    'Usage: ai-bridge plan [options] <task prompt>',
    '',
    'Options:',
    `  --model <slug>       Model slug (default: ${DEFAULT_MODEL})`,
    '  --out <file>         Where to write the plan (default: <run.dir>/plan.md)',
    '  --timeout <secs>     Max seconds for planning (default: 1800)',
    '  --no-preflight       Skip the backend quota preflight check',
    '  -h, --help           Show this help',
    '',
  ].join('\n');
}

export async function runPlan(ctx: LocalContext, argv: readonly string[]): Promise<void> {
  let values: {
    model?: string;
    out?: string;
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
        out: { type: 'string' },
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

  let prompt: string;
  let timeout: number | undefined;
  try {
    const [first, ...extra] = positionals;
    if (first === undefined) throw new Error('missing <task prompt> argument');
    if (extra.length > 0) throw new Error(`unexpected extra argument "${extra[0]}"`);
    prompt = nonEmptyPrompt(first);
    timeout = values.timeout === undefined ? undefined : positiveIntSeconds(values.timeout);
  } catch (err) {
    return fail(ctx, err);
  }

  const flags: PlanFlags = {
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(values.out !== undefined ? { out: values.out } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    preflight: values['no-preflight'] !== true,
  };

  await planImpl.call(ctx, flags, prompt);
}

function fail(ctx: LocalContext, err: unknown): void {
  ctx.process.stderr.write(`ai-bridge plan: ${err instanceof Error ? err.message : String(err)}\n`);
  ctx.process.exitCode = 2;
}
