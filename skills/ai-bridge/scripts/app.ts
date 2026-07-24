import { runImageGen } from './commands/image-gen/command.ts';
import { runImplement } from './commands/implement/command.ts';
import { runPlan } from './commands/plan/command.ts';
import { runQuota } from './commands/quota/command.ts';
import { runReview } from './commands/review/command.ts';
import { runRuns } from './commands/runs/command.ts';
import { runSubagent } from './commands/subagent/command.ts';
import type { LocalContext } from './context.ts';

const BRIEF =
  'Bridge tasks to non-Claude AI CLIs — a plan → implement → review workflow, task delegation, and image generation (codex gpt-image-2 / grok Imagine).';

function topLevelHelp(): string {
  return [
    `ai-bridge — ${BRIEF}`,
    '',
    'Usage: ai-bridge <command> [options]',
    '',
    'Commands:',
    '  plan        Expand a task into a detailed implementation plan file',
    '  implement   Implement a plan file in place (edits the working tree)',
    '  review      Review the working-tree diff (or a plan) against a plan contract',
    '  subagent    Delegate a self-contained task to a non-Claude model',
    '  image-gen   Generate a raster image via a model seat (codex or grok)',
    '  runs        Monitor and inspect execution runs',
    '  quota       Show backend quota and reset times (agy, codex, claude)',
    '',
    "Run `ai-bridge <command> --help` for a command's options.",
    '',
  ].join('\n');
}

/**
 * Top-level router. Dispatches the first argument to a subcommand; `--help` (or
 * no command) prints the command list. An unknown command exits non-zero so a
 * typo in a script fails loudly rather than silently no-op-ing.
 */
export async function runCli(ctx: LocalContext, argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (command === undefined || command === '--help' || command === '-h') {
    ctx.process.stdout.write(topLevelHelp());
    return;
  }

  switch (command) {
    case 'plan':
      return runPlan(ctx, rest);
    case 'implement':
      return runImplement(ctx, rest);
    case 'review':
      return runReview(ctx, rest);
    case 'subagent':
      return runSubagent(ctx, rest);
    case 'image-gen':
      return runImageGen(ctx, rest);
    case 'runs':
      return runRuns(ctx, rest);
    case 'quota':
      return runQuota(ctx, rest);
    default:
      ctx.process.stderr.write(`ai-bridge: unknown command "${command}"\n\n${topLevelHelp()}`);
      ctx.process.exitCode = 2;
      return;
  }
}
