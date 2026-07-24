import type { AgentCliDriver, DelegationResult } from './driver.ts';
import { getDriver } from './drivers.ts';
import { backendModelId, type ResolvedModel } from './models.ts';
import type { RunLog } from './runlog.ts';

export interface DelegateOptions {
  readonly model: ResolvedModel;
  readonly prompt: string;
  readonly tools: boolean;
  readonly timeoutSec: number;
  readonly cwd: string;
  readonly run: RunLog;
}

export type DelegateOutcome = DelegationResult;

const PREAMBLE =
  'You are the sole executing agent for this task: do it yourself with your tools, now. ' +
  'Never defer to, wait for, or claim to hand off to another agent or process — no one ' +
  'else will act, and work not done in this run does not happen.\n\n';

export async function delegate(
  opts: DelegateOptions,
  driver: AgentCliDriver = getDriver(opts.model.spec.backend),
): Promise<DelegateOutcome> {
  const effectivePrompt = opts.tools ? PREAMBLE + opts.prompt : opts.prompt;
  const result = await driver.run({
    prompt: effectivePrompt,
    tools: opts.tools,
    timeoutSec: opts.timeoutSec,
    cwd: opts.cwd,
    backendModel: backendModelId(opts.model) ?? opts.model.spec.backendModel,
    effort: opts.model.effort,
    onStdout: c => opts.run.stdout(c),
    onStderr: c => opts.run.stderr(c),
    onSpawn: pid => opts.run.setPid(pid),
  });

  if (result.ok) {
    opts.run.finish('done', result.exitCode);
  } else {
    opts.run.finish(result.kind === 'timeout' ? 'timeout' : 'error', result.exitCode);
  }

  return result;
}
