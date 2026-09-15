import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const RUN_KEEP_COUNT = 50;
export const SPAWN_GRACE_MS = 30_000;
export const PID_AGE_SLACK_MS = 30_000;
export const ACTIVITY_FLUSH_MS = 1_000;

export type RunStatus = 'running' | 'done' | 'error' | 'timeout' | 'stale';

export interface RunMeta {
  readonly id: string;
  readonly command: string;
  readonly detail: string;
  pid: number | null;
  readonly startedAt: string;
  endedAt: string | null;
  lastActivityAt: string;
  status: RunStatus;
  exitCode: number | null;
}

export interface RunLog {
  readonly id: string;
  readonly dir: string;
  setPid(pid: number): void;
  stdout(chunk: string): void;
  stderr(chunk: string): void;
  touch(): void;
  finish(status: 'done' | 'error' | 'timeout', exitCode: number | null): void;
}

export type PidProbe = (pid: number, startedAtIso: string, nowMs: number) => boolean;

export interface RunStoreOptions {
  readonly runsDir?: string;
  readonly now?: () => Date;
  readonly keep?: number;
  readonly pidAlive?: PidProbe;
  readonly activityFlushMs?: number;
}

export function defaultRunsDir(): string {
  return join(homedir(), '.aibridge', 'runs');
}

function getTimestamp(d = new Date()): string {
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${dd}-${HH}${mm}${ss}`;
}

export function parseEtimeSeconds(etimeStr: string): number | null {
  const trimmed = etimeStr.trim();
  if (!trimmed) return null;
  const daySplit = trimmed.split('-');
  let days = 0;
  let rest = trimmed;
  if (daySplit.length === 2) {
    days = Number.parseInt(daySplit[0] ?? '', 10);
    rest = daySplit[1] ?? '';
    if (Number.isNaN(days)) return null;
  } else if (daySplit.length > 2) {
    return null;
  }
  const parts = rest.split(':');
  if (parts.length === 2) {
    const mm = Number.parseInt(parts[0] ?? '', 10);
    const ss = Number.parseInt(parts[1] ?? '', 10);
    if (Number.isNaN(mm) || Number.isNaN(ss)) return null;
    return days * 86400 + mm * 60 + ss;
  }
  if (parts.length === 3) {
    const hh = Number.parseInt(parts[0] ?? '', 10);
    const mm = Number.parseInt(parts[1] ?? '', 10);
    const ss = Number.parseInt(parts[2] ?? '', 10);
    if (Number.isNaN(hh) || Number.isNaN(mm) || Number.isNaN(ss)) return null;
    return days * 86400 + hh * 3600 + mm * 60 + ss;
  }
  return null;
}

export const defaultPidAlive: PidProbe = (
  pid: number,
  startedAtIso: string,
  nowMs: number,
): boolean => {
  try {
    process.kill(pid, 0);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    return false;
  }

  try {
    const res = execFileSync('ps', ['-p', String(pid), '-o', 'etime='], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 2000,
    });
    const parsedSec = parseEtimeSeconds(res);
    if (parsedSec !== null) {
      const startedMs = new Date(startedAtIso).getTime();
      if (!Number.isNaN(startedMs)) {
        const expectedSec = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
        if (Math.abs(parsedSec - expectedSec) > PID_AGE_SLACK_MS / 1000) {
          return false;
        }
      }
    }
  } catch {
    // If ps fails or cannot be parsed, fall back to kill(0) (alive)
  }

  return true;
};

function reconcileMeta(
  meta: RunMeta,
  metaJsonPath: string,
  nowMs: number,
  pidAlive: PidProbe,
): boolean {
  if (meta.status === 'running') {
    let alive = false;
    if (meta.pid !== null) {
      alive = pidAlive(meta.pid, meta.startedAt, nowMs);
    } else {
      const startedMs = new Date(meta.startedAt).getTime();
      alive = !Number.isNaN(startedMs) && nowMs - startedMs < SPAWN_GRACE_MS;
    }
    if (!alive) {
      meta.status = 'stale';
      meta.endedAt = meta.lastActivityAt;
      try {
        writeFileSync(metaJsonPath, JSON.stringify(meta, null, 2), 'utf8');
      } catch {
        // ignore
      }
      return false;
    }
    return true;
  }
  return false;
}

function pruneRuns(runsDir: string, currentRunId: string, opts?: RunStoreOptions): void {
  try {
    if (!existsSync(runsDir)) return;
    const now = opts?.now ? opts.now() : new Date();
    const nowMs = now.getTime();
    const keep = opts?.keep ?? RUN_KEEP_COUNT;
    const pidAlive = opts?.pidAlive ?? defaultPidAlive;

    const entries = readdirSync(runsDir, { withFileTypes: true });
    interface Candidate {
      name: string;
      dirPath: string;
      startedAtMs: number;
    }

    const nonLiveCandidates: Candidate[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === currentRunId) continue;

      const dirPath = join(runsDir, entry.name);
      const metaPath = join(dirPath, 'meta.json');

      let isLive = false;
      let startedAtMs: number | null = null;

      if (existsSync(metaPath)) {
        try {
          const content = readFileSync(metaPath, 'utf8');
          const meta = JSON.parse(content) as RunMeta;
          if (meta && typeof meta === 'object') {
            if (!meta.lastActivityAt || typeof meta.lastActivityAt !== 'string') {
              meta.lastActivityAt = meta.endedAt ?? meta.startedAt ?? new Date().toISOString();
            }
            isLive = reconcileMeta(meta, metaPath, nowMs, pidAlive);
            if (meta.startedAt) {
              const parsed = new Date(meta.startedAt).getTime();
              if (!Number.isNaN(parsed)) {
                startedAtMs = parsed;
              }
            }
          }
        } catch {
          // unreadable / corrupt meta
        }
      }

      if (isLive) {
        continue;
      }

      if (startedAtMs === null) {
        try {
          startedAtMs = statSync(dirPath).mtimeMs;
        } catch {
          startedAtMs = 0;
        }
      }

      nonLiveCandidates.push({
        name: entry.name,
        dirPath,
        startedAtMs,
      });
    }

    if (nonLiveCandidates.length > keep) {
      nonLiveCandidates.sort((a, b) => b.startedAtMs - a.startedAtMs);
      const toDelete = nonLiveCandidates.slice(keep);
      for (const item of toDelete) {
        try {
          rmSync(item.dirPath, { recursive: true, force: true });
        } catch {
          // catch per-dir
        }
      }
    }
  } catch {
    // ignore
  }
}

export function startRun(command: string, detail: string, opts?: RunStoreOptions): RunLog {
  const runsDir = opts?.runsDir ?? defaultRunsDir();
  const now = opts?.now ? opts.now() : new Date();
  const nowMs = now.getTime();
  const id = `${getTimestamp(now)}-${command}-${randomBytes(2).toString('hex')}`;
  const dir = join(runsDir, id);

  try {
    mkdirSync(runsDir, { recursive: true });
    mkdirSync(dir, { recursive: true });

    const startedAt = now.toISOString();
    const meta: RunMeta = {
      id,
      command,
      detail,
      pid: null,
      startedAt,
      endedAt: null,
      lastActivityAt: startedAt,
      status: 'running',
      exitCode: null,
    };

    const metaJsonPath = join(dir, 'meta.json');
    const stdoutLogPath = join(dir, 'stdout.log');
    const stderrLogPath = join(dir, 'stderr.log');

    writeFileSync(metaJsonPath, JSON.stringify(meta, null, 2), 'utf8');
    writeFileSync(stdoutLogPath, '', 'utf8');
    writeFileSync(stderrLogPath, '', 'utf8');

    pruneRuns(runsDir, id, opts);

    const activityFlushMs = opts?.activityFlushMs ?? ACTIVITY_FLUSH_MS;
    let lastFlushedActivityMs = nowMs;

    const recordActivity = (flushImmediately = false) => {
      const currentNow = opts?.now ? opts.now() : new Date();
      const currentNowMs = currentNow.getTime();
      meta.lastActivityAt = currentNow.toISOString();
      if (
        flushImmediately ||
        activityFlushMs === 0 ||
        currentNowMs - lastFlushedActivityMs >= activityFlushMs
      ) {
        lastFlushedActivityMs = currentNowMs;
        try {
          writeFileSync(metaJsonPath, JSON.stringify(meta, null, 2), 'utf8');
        } catch {
          // ignore
        }
      }
    };

    return {
      id,
      dir,
      setPid(pid: number) {
        try {
          meta.pid = pid;
          recordActivity(true);
        } catch {
          // ignore
        }
      },
      stdout(chunk: string) {
        try {
          appendFileSync(stdoutLogPath, chunk, 'utf8');
        } catch {
          // ignore
        }
        recordActivity(false);
      },
      stderr(chunk: string) {
        try {
          appendFileSync(stderrLogPath, chunk, 'utf8');
        } catch {
          // ignore
        }
        recordActivity(false);
      },
      touch() {
        recordActivity(false);
      },
      finish(status: 'done' | 'error' | 'timeout', exitCode: number | null) {
        try {
          const currentNow = opts?.now ? opts.now() : new Date();
          meta.status = status;
          meta.exitCode = exitCode;
          meta.endedAt = currentNow.toISOString();
          recordActivity(true);
        } catch {
          // ignore
        }
      },
    };
  } catch {
    return {
      id,
      dir: '',
      setPid() {},
      stdout() {},
      stderr() {},
      touch() {},
      finish() {},
    };
  }
}

export function beginDelegatedRun(
  command: string,
  detail: string,
  stderr: { write(chunk: string): unknown },
  opts?: RunStoreOptions,
): RunLog {
  const run = startRun(command, detail, opts);
  try {
    stderr.write(`aibridge: run ${run.id}\n`);
    if (run.dir === '') {
      stderr.write('aibridge: warning: failed to persist run log to directory\n');
    }
  } catch {
    // ignore
  }
  return run;
}

export function listRuns(opts?: RunStoreOptions): RunMeta[] {
  const runsDir = opts?.runsDir ?? defaultRunsDir();
  if (!existsSync(runsDir)) return [];
  const now = opts?.now ? opts.now() : new Date();
  const nowMs = now.getTime();
  const pidAlive = opts?.pidAlive ?? defaultPidAlive;

  try {
    const entries = readdirSync(runsDir, { withFileTypes: true });
    const runs: RunMeta[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const metaPath = join(runsDir, entry.name, 'meta.json');
          if (existsSync(metaPath)) {
            const content = readFileSync(metaPath, 'utf8');
            const parsed = JSON.parse(content) as RunMeta;
            if (
              parsed &&
              typeof parsed === 'object' &&
              parsed.id &&
              parsed.startedAt &&
              typeof parsed.detail === 'string'
            ) {
              if (!parsed.lastActivityAt || typeof parsed.lastActivityAt !== 'string') {
                parsed.lastActivityAt = parsed.endedAt ?? parsed.startedAt;
              }
              reconcileMeta(parsed, metaPath, nowMs, pidAlive);
              runs.push(parsed);
            }
          }
        } catch {
          // skip
        }
      }
    }
    return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  } catch {
    return [];
  }
}

export function readRunLogs(
  id: string,
  opts?: RunStoreOptions,
): { meta: RunMeta; stdout: string; stderr: string } | null {
  const runsDir = opts?.runsDir ?? defaultRunsDir();
  const now = opts?.now ? opts.now() : new Date();
  const nowMs = now.getTime();
  const pidAlive = opts?.pidAlive ?? defaultPidAlive;

  const dir = join(runsDir, id);
  const metaPath = join(dir, 'meta.json');
  const stdoutPath = join(dir, 'stdout.log');
  const stderrPath = join(dir, 'stderr.log');
  if (!existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as RunMeta;
    if (!meta.lastActivityAt || typeof meta.lastActivityAt !== 'string') {
      meta.lastActivityAt = meta.endedAt ?? meta.startedAt;
    }
    reconcileMeta(meta, metaPath, nowMs, pidAlive);
    let stdout = '';
    try {
      stdout = existsSync(stdoutPath) ? readFileSync(stdoutPath, 'utf8') : '';
    } catch {
      stdout = '';
    }
    let stderr = '';
    try {
      stderr = existsSync(stderrPath) ? readFileSync(stderrPath, 'utf8') : '';
    } catch {
      stderr = '';
    }
    return { meta, stdout, stderr };
  } catch {
    return null;
  }
}
