import type { CommandContext } from '@stricli/core';

export interface LocalContext extends CommandContext {
  /** Full Node process — satisfies stricli WritableStreams + exitCode/env/cwd used by impls. */
  readonly process: NodeJS.Process;
}

export function buildContext(process: NodeJS.Process): LocalContext {
  return { process };
}
