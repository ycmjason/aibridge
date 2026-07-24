import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { runCaptured } from '@aibridge/proc';
import type { LocalContext } from '../../context.ts';
import { delegate } from '../../delegate.ts';
import { DEFAULT_IMPLEMENTER, formatUnknownModelError, resolveModel } from '../../models.ts';
import { preflightModel, renderPreflightRefusal } from '../../quotaPreflight.ts';
import { startRun } from '../../runlog.ts';

export interface ImplementFlags {
  readonly model?: string;
  readonly timeout?: number;
  readonly preflight: boolean;
}

export default async function implement(
  this: LocalContext,
  flags: ImplementFlags,
  planFile: string,
): Promise<void> {
  const inputSlug = flags.model ?? DEFAULT_IMPLEMENTER;
  const model = resolveModel(inputSlug);
  if (!model) {
    this.process.stderr.write(`${formatUnknownModelError(inputSlug)}\n`);
    this.process.exitCode = 2;
    return;
  }

  const cwd = this.process.cwd();
  const absPlanPath = isAbsolute(planFile) ? planFile : resolve(cwd, planFile);
  if (!existsSync(absPlanPath)) {
    this.process.stderr.write(`aibridge implement: plan file "${absPlanPath}" not found\n`);
    this.process.exitCode = 2;
    return;
  }

  if (flags.preflight) {
    const verdict = await preflightModel(model);
    if (!verdict.ok) {
      this.process.stderr.write(`${renderPreflightRefusal('implement', verdict)}\n`);
      this.process.exitCode = 3;
      return;
    }
    if (verdict.warning) this.process.stderr.write(`aibridge implement: ${verdict.warning}\n`);
  }

  const timeoutSec = flags.timeout ?? 1800;
  const run = startRun('implement', `${model.spec.slug}: ${planFile}`);

  const implementPrompt =
    `Read the implementation plan file at ${absPlanPath} and implement it EXACTLY.\n` +
    `Edit only the files it names. Run the project's REAL typecheck and tests and fix until green.\n` +
    `Do NOT commit, push, or delete unrelated files. Reply with a short summary (files changed + final typecheck/test results).`;

  const outcome = await delegate({
    model,
    prompt: implementPrompt,
    tools: true,
    timeoutSec,
    cwd,
    run,
  });

  if (!outcome.ok) {
    this.process.stderr.write(`${outcome.message}\n`);
    this.process.exitCode = 1;
    return;
  }

  const diffRes = await runCaptured('git', ['diff', '--stat'], { cwd });
  const diffStat = diffRes.stdout.trim();

  const statusRes = await runCaptured('git', ['status', '--porcelain'], { cwd });
  let untrackedCount = 0;
  if (statusRes.code === 0) {
    for (const line of statusRes.stdout.split(/\r?\n/)) {
      if (line.startsWith('??')) {
        untrackedCount++;
      }
    }
  }

  if (diffStat.length === 0 && untrackedCount === 0) {
    this.process.stderr.write(
      `aibridge implement: delegate completed but made zero working tree changes.\n`,
    );
    this.process.exitCode = 1;
    return;
  }

  const outputParts = [outcome.response, ''];
  if (diffStat.length > 0) {
    outputParts.push(diffStat);
  }
  outputParts.push(`untracked files: ${untrackedCount}`);
  outputParts.push(`run: ${run.id}`);

  this.process.stdout.write(`${outputParts.join('\n')}\n`);
}
