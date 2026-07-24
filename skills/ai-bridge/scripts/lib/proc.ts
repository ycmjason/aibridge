import { spawn } from 'node:child_process';

/**
 * Small process helpers shared by the command implementations.
 *
 * The external CLIs (`agy`, `codex`) are spawned as children with their stdio
 * fully piped — no pseudo-TTY needed (re-verified on agy 1.0.6 / codex 0.137:
 * both emit fine to a non-TTY stdout). We capture their output, enforce our own
 * kill timeout, and surface clear errors.
 */

export interface RunResult {
  /** Exit code, or null if the process was killed by a signal. */
  readonly code: number | null;
  /** Signal that killed the process, if any. */
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  /** True if our timeout fired and we killed the child. */
  readonly timedOut: boolean;
}

export interface RunOptions {
  readonly cwd?: string;
  /** Kill the child after this many ms (0/undefined = no limit). */
  readonly timeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly onStdout?: (chunk: string) => void;
  readonly onStderr?: (chunk: string) => void;
  readonly onSpawn?: (pid: number) => void;
}

/**
 * Spawn a command, capture stdout/stderr as UTF-8 strings, and resolve when it
 * exits. Rejects only if the process cannot be spawned at all (e.g. ENOENT) —
 * a non-zero exit resolves normally with the captured streams.
 */
export function runCaptured(
  command: string,
  args: readonly string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (child.pid !== undefined) {
      opts.onSpawn?.(child.pid);
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
      opts.onStdout?.(d);
    });
    child.stderr.on('data', (d: string) => {
      stderr += d;
      opts.onStderr?.(d);
    });

    let timer: NodeJS.Timeout | undefined;
    let hardKillTimer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      // Cap to setTimeout's 32-bit ceiling so a pathological value can't wrap to 1ms.
      const ms = Math.min(opts.timeoutMs, 2_147_483_647);
      timer = setTimeout(() => {
        timedOut = true;
        // SIGTERM first so agy/codex can tear down their own child processes,
        // then SIGKILL the holdout after a short grace window.
        child.kill('SIGTERM');
        hardKillTimer = setTimeout(() => child.kill('SIGKILL'), 3_000);
        hardKillTimer.unref();
      }, ms);
      timer.unref();
    }

    const clearTimers = (): void => {
      if (timer) clearTimeout(timer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
    };

    child.on('error', err => {
      clearTimers();
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimers();
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

/** True if the spawn error means the binary was not found on PATH. */
export function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ENOENT'
  );
}

/**
 * Probe a binary's `--version`. Returns the raw first line of stdout (trimmed),
 * or null if the binary is missing / does not respond in time.
 */
export async function probeVersion(command: string): Promise<string | null> {
  try {
    const r = await runCaptured(command, ['--version'], { timeoutMs: 10_000 });
    if (r.timedOut) return null;
    const line = (r.stdout || r.stderr).split('\n')[0]?.trim();
    return line && line.length > 0 ? line : null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Extract the first `major.minor.patch` triple from a version string. */
export function parseSemver(s: string): readonly [number, number, number] | null {
  const m = s.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** True if version `a` is >= version `b` (both as [major, minor, patch]). */
export function semverGte(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): boolean {
  for (let i = 0; i < 3; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is the point — this strips ANSI sequences.
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/** Strip ANSI/VT escape sequences from a string. */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}
