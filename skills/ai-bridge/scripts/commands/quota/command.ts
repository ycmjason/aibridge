import { parseArgs } from 'node:util';
import type { LocalContext } from '../../context.ts';
import quotaImpl, { type QuotaFlags } from './impl.ts';

function help(): string {
  return [
    'ai-bridge quota — Show agy / codex / claude quota with reset times',
    '',
    'agy: reads its cached OAuth token (~/.gemini/antigravity-cli/) and asks the',
    'Cloud Code API for per-model remaining quota. EXHAUSTED means agy turns on',
    'that model fail with an empty answer until the reset time.',
    'codex: reads ~/.codex/auth.json and asks the ChatGPT usage endpoint for the',
    '5-hour and weekly windows (used % + reset). No separate logins for either.',
    'claude: shells out to `claude -p "/usage"` (the slow leg, ~5-10s) and parses',
    'the session + weekly windows — no HTTP endpoint exists and we never touch',
    'the Keychain; the claude CLI uses its own credentials.',
    '',
    'Usage:',
    '  ai-bridge quota [--json]',
    '',
    'Options:',
    '  --json     Emit the raw snapshot as JSON',
    '  -h, --help Show this help',
    '',
  ].join('\n');
}

export async function runQuota(ctx: LocalContext, argv: readonly string[]): Promise<void> {
  let values: { json: boolean; help: boolean };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      allowPositionals: false,
      options: {
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (err) {
    ctx.process.stderr.write(`ai-bridge quota: ${(err as Error).message}\n\n${help()}`);
    ctx.process.exitCode = 2;
    return;
  }

  if (values.help) {
    ctx.process.stdout.write(help());
    return;
  }

  const flags: QuotaFlags = { json: values.json };
  try {
    await quotaImpl.call(ctx, flags);
  } catch (err) {
    ctx.process.stderr.write(`ai-bridge quota: ${(err as Error).message}\n`);
    ctx.process.exitCode = 1;
  }
}
