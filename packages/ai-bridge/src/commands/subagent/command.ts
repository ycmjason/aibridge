import { parseArgs } from 'node:util';
import type { LocalContext } from '../../context.ts';
import { DEFAULT_MODEL, listModelHelpLines } from '../../models.ts';
import { nonEmptyPrompt, positiveIntSeconds } from '../../parsers.ts';
import subagentImpl, { type SubagentFlags } from './impl.ts';

function help(): string {
  return [
    'ai-bridge subagent — Delegate a self-contained task to another model',
    '',
    'Hands a self-contained prompt to another model and returns its answer.',
    'Available models (canonical slug):',
    ...listModelHelpLines(),
    `Default: ${DEFAULT_MODEL} (off-budget). The claude-backend slugs are FALLBACKS for`,
    'when the off-budget CLIs are quota-exhausted — they bill your Claude subscription.',
    '',
    'Usage: ai-bridge subagent [options] <prompt>',
    '',
    'Options:',
    `  --model <slug>     Model slug to delegate to (default: ${DEFAULT_MODEL})`,
    '  --timeout <secs>   Max seconds to wait for the backend (default: 600)',
    '  --no-tools         Restrict the delegate to reasoning only (no file/shell',
    '                     access). Tools are ON by default; use this for untrusted input.',
    '  --no-preflight     Skip the backend quota preflight check',
    '  --json             Emit a machine-readable JSON result (using canonical slug) instead of prose',
    '  -h, --help         Show this help',
    '',
  ].join('\n');
}

export async function runSubagent(ctx: LocalContext, argv: readonly string[]): Promise<void> {
  let values: {
    model?: string;
    timeout?: string;
    tools?: boolean;
    'no-tools'?: boolean;
    preflight?: boolean;
    'no-preflight'?: boolean;
    json: boolean;
    help: boolean;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        model: { type: 'string' },
        timeout: { type: 'string' },
        tools: { type: 'boolean' },
        'no-tools': { type: 'boolean' },
        preflight: { type: 'boolean' },
        'no-preflight': { type: 'boolean' },
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

  let prompt: string;
  let timeout: number | undefined;
  try {
    const [first, ...extra] = positionals;
    if (first === undefined) throw new Error('missing <prompt> argument');
    if (extra.length > 0) throw new Error(`unexpected extra argument "${extra[0]}"`);
    prompt = nonEmptyPrompt(first);
    timeout = values.timeout === undefined ? undefined : positiveIntSeconds(values.timeout);
  } catch (err) {
    return fail(ctx, err);
  }

  const flags: SubagentFlags = {
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    tools: values['no-tools'] !== true,
    preflight: values['no-preflight'] !== true,
    json: values.json,
  };

  await subagentImpl.call(ctx, flags, prompt);
}

function fail(ctx: LocalContext, err: unknown): void {
  ctx.process.stderr.write(
    `ai-bridge subagent: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  ctx.process.exitCode = 2;
}
