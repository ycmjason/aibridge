import type { LocalContext } from '../../context.ts';
import { delegate } from '../../lib/delegate.ts';
import {
  backendModelId,
  DEFAULT_MODEL,
  formatUnknownModelError,
  resolveModel,
} from '../../lib/models.ts';
import { preflightModel, renderPreflightRefusal } from '../../lib/quotaPreflight.ts';
import { startRun } from '../../lib/runlog.ts';

export interface SubagentFlags {
  readonly model?: string;
  readonly timeout?: number;
  readonly tools: boolean;
  readonly preflight: boolean;
  readonly json: boolean;
}

export default async function subagent(
  this: LocalContext,
  flags: SubagentFlags,
  prompt: string,
): Promise<void> {
  const inputSlug = flags.model ?? DEFAULT_MODEL;
  const model = resolveModel(inputSlug);
  if (!model) {
    this.process.stderr.write(`${formatUnknownModelError(inputSlug)}\n`);
    this.process.exitCode = 2;
    return;
  }

  if (flags.preflight) {
    const verdict = await preflightModel(model);
    if (!verdict.ok) {
      if (flags.json) {
        this.process.stdout.write(
          `${JSON.stringify({
            error: 'quota_exhausted',
            message: verdict.message,
            resetAt: verdict.resetAt ?? null,
            slug: model.spec.slug,
          })}\n`,
        );
      } else {
        this.process.stderr.write(`${renderPreflightRefusal('subagent', verdict)}\n`);
      }
      this.process.exitCode = 3;
      return;
    }
    if (verdict.warning) this.process.stderr.write(`ai-bridge subagent: ${verdict.warning}\n`);
  }

  const timeoutSec = flags.timeout ?? 600;
  const workDir = this.process.cwd();
  const promptSnippet = prompt.replace(/\r?\n/g, ' ').slice(0, 80);
  const run = startRun('subagent', `${model.spec.slug}: ${promptSnippet}`);

  const outcome = await delegate({
    model,
    prompt,
    tools: flags.tools,
    timeoutSec,
    cwd: workDir,
    run,
  });

  if (!outcome.ok) {
    this.process.stderr.write(`${outcome.message}\n`);
    this.process.exitCode = 1;
    return;
  }

  if (flags.json) {
    const modelId = backendModelId(model) ?? null;
    this.process.stdout.write(
      `${JSON.stringify({
        model: modelId,
        slug: model.spec.slug,
        response: outcome.response,
        exitCode: outcome.exitCode,
      })}\n`,
    );
  } else {
    this.process.stdout.write(`${outcome.response}\n`);
  }
}
