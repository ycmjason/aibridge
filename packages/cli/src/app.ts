import { buildApplication, buildRouteMap, run } from '@stricli/core';
import { imageGen } from './commands/image-gen/command.ts';
import { implement } from './commands/implement/command.ts';
import { models } from './commands/models/command.ts';
import { plan } from './commands/plan/command.ts';
import { quota } from './commands/quota/command.ts';
import { review } from './commands/review/command.ts';
import { runs } from './commands/runs/command.ts';
import { skill } from './commands/skill/command.ts';
import { subagent } from './commands/subagent/command.ts';
import type { LocalContext } from './context.ts';
import { normalizeExitCode } from './exitCode.ts';
import { PACKAGE_VERSION } from './package.ts';

const BRIEF =
  'Bridge tasks to the other AI CLIs on this machine — a plan → implement → review workflow, task delegation, and image generation (codex / agy / grok seats).';

const routes = buildRouteMap({
  routes: {
    plan,
    implement,
    review,
    subagent,
    'image-gen': imageGen,
    runs,
    quota,
    models,
    skill,
  },
  docs: {
    brief: BRIEF,
  },
});

export const app = buildApplication(routes, {
  name: 'aibridge',
  versionInfo: {
    currentVersion: PACKAGE_VERSION,
  },
  scanner: {
    // Accept --no-preflight / --no-tools while flag keys stay camelCase in TS
    caseStyle: 'allow-kebab-for-camel',
  },
});

/** Public entry used by cli.ts and index.ts — preserves runCli(ctx, argv) surface. */
export async function runCli(ctx: LocalContext, argv: readonly string[]): Promise<void> {
  await run(app, argv, ctx);
  normalizeExitCode(ctx);
}
