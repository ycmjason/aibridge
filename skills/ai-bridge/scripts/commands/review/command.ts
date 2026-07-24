import { parseArgs } from 'node:util';
import type { LocalContext } from '../../context.ts';
import { DEFAULT_MODEL, listModelHelpLines } from '../../lib/models.ts';
import { positiveIntSeconds } from '../../lib/parsers.ts';
import reviewImpl, { type ReviewFlags } from './impl.ts';

function help(): string {
  return [
    'ai-bridge review — Review working tree diff or plan contract',
    '',
    'Inspects code diffs or plan contracts and writes a review report.',
    'Available models (canonical slug):',
    ...listModelHelpLines(),
    '',
    'Usage: ai-bridge review [options]',
    '',
    'Options:',
    `  --model <slug>       Model slug (default: ${DEFAULT_MODEL})`,
    '  --plan <file>        Plan file for contract / over-reach check',
    '  --base <ref>         Base git ref to diff against (default: HEAD)',
    '  --out <file>         Where to write the review report (default: <run.dir>/review.md)',
    '  --timeout <secs>     Max seconds for review (default: 1200)',
    '  --no-preflight       Skip the backend quota preflight check',
    '  -h, --help           Show this help',
    '',
  ].join('\n');
}

export async function runReview(ctx: LocalContext, argv: readonly string[]): Promise<void> {
  let values: {
    model?: string;
    plan?: string;
    base?: string;
    out?: string;
    preflight?: boolean;
    'no-preflight'?: boolean;
    timeout?: string;
    help: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        model: { type: 'string' },
        plan: { type: 'string' },
        base: { type: 'string' },
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

  let timeout: number | undefined;
  try {
    timeout = values.timeout === undefined ? undefined : positiveIntSeconds(values.timeout);
  } catch (err) {
    return fail(ctx, err);
  }

  const flags: ReviewFlags = {
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(values.plan !== undefined ? { plan: values.plan } : {}),
    ...(values.base !== undefined ? { base: values.base } : {}),
    ...(values.out !== undefined ? { out: values.out } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    preflight: values['no-preflight'] !== true,
  };

  await reviewImpl.call(ctx, flags);
}

function fail(ctx: LocalContext, err: unknown): void {
  ctx.process.stderr.write(
    `ai-bridge review: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  ctx.process.exitCode = 2;
}
