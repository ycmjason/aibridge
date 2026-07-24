import { ExitCode } from '@stricli/core';
import type { LocalContext } from './context.ts';

/**
 * Stricli uses negative ExitCode values for parse/route failures.
 * Our public contract is Unix-style: 0 ok, 1 op fail, 2 bad args, 3 quota refuse.
 * Call after `run()`; never overwrite a code already set by an impl (run uses ??=).
 */
export function normalizeExitCode(ctx: LocalContext): void {
  const code = ctx.process.exitCode;
  if (typeof code !== 'number') return;
  if (code === ExitCode.InvalidArgument || code === ExitCode.UnknownCommand) {
    ctx.process.exitCode = 2;
    return;
  }
  // Contract-space fallback: impls only ever set 0/1/2/3. Anything else on
  // the process at this point is a stricli framework code (whatever its
  // actual numeric value in this stricli version) → operational failure.
  // Do NOT assume framework codes are negative — compare against the
  // ExitCode constants and the contract space only.
  if (code !== 0 && code !== 1 && code !== 2 && code !== 3) {
    ctx.process.exitCode = 1;
  }
}
