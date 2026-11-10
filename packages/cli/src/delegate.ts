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

export async function delegate(
  opts: DelegateOptions,
  driver: AgentCliDriver = getDriver(opts.model.spec.backend),
): Promise<DelegateOutcome> {
  // The caller's prompt goes to the CLI verbatim; aibridge adds nothing.
  const result = await driver.run({
    prompt: opts.prompt,
    tools: opts.tools,
    timeoutSec: opts.timeoutSec,
    cwd: opts.cwd,
    backendModel: backendModelId(opts.model),
    effort: opts.model.effort,
    onStdout: c => opts.run.stdout(c),
    onStderr: c => opts.run.stderr(c),
    onSpawn: pid => opts.run.setPid(pid),
    onActivity: () => opts.run.touch(),
  });

  if (result.ok) {
    opts.run.finish('done', result.exitCode);
  } else {
    opts.run.finish(result.kind === 'timeout' ? 'timeout' : 'error', result.exitCode);
  }

  return result;
}
