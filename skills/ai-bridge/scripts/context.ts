/**
 * Runtime context handed to every command implementation as `this`.
 *
 * Keep it small; extend it as commands need more capabilities (a logger, a
 * clock, or injected CLI runners so impls can be tested without spawning the
 * real `agy` / `codex` processes).
 */
export interface LocalContext {
  readonly process: NodeJS.Process;
}

export function buildContext(process: NodeJS.Process): LocalContext {
  return { process };
}
