/**
 * Helper for building Antigravity CLI (`agy`) print arguments.
 *
 * agy resets its own working directory (it emits "Shell cwd was reset …") and
 * treats its --add-dir workspace as "the current directory", ignoring the cwd
 * it was spawned with. So to let the delegate edit the CALLER's repo we must
 * pass that dir explicitly as the FIRST --add-dir (its primary workspace) and
 * anchor the prompt to it — otherwise file edits land in a throwaway dir and
 * never reach the codebase.
 */

export interface AgyPrintArgs {
  readonly model: string; // full id including effort for gemini
  readonly printTimeoutSec: number;
  readonly skipPermissions?: boolean;
  readonly addDirs?: readonly string[]; // order preserved
}

/**
 * Assemble the `agy -p …` argv.
 */
export function buildAgyPrintArgs(prompt: string, opts: AgyPrintArgs): string[] {
  const args = ['-p', prompt, '--model', opts.model, '--print-timeout', `${opts.printTimeoutSec}s`];

  if (opts.skipPermissions) {
    args.push('--dangerously-skip-permissions');
  }

  for (const dir of opts.addDirs ?? []) {
    args.push('--add-dir', dir);
  }

  return args;
}
