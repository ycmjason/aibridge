import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface RunMeta {
  readonly id: string;
  readonly command: string;
  readonly detail: string;
  pid: number | null;
  readonly startedAt: string;
  endedAt: string | null;
  status: 'running' | 'done' | 'error' | 'timeout' | 'stale';
  exitCode: number | null;
}

export interface RunLog {
  readonly id: string;
  readonly dir: string;
  setPid(pid: number): void;
  stdout(chunk: string): void;
  stderr(chunk: string): void;
  finish(status: 'done' | 'error' | 'timeout', exitCode: number | null): void;
}

function getTimestamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${dd}-${HH}${mm}${ss}`;
}

function pruneOldRuns(runsDir: string): void {
  try {
    if (!existsSync(runsDir)) return;
    const entries = readdirSync(runsDir, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();

    if (dirs.length > 50) {
      const toDelete = dirs.slice(0, dirs.length - 50);
      for (const d of toDelete) {
        try {
          rmSync(join(runsDir, d), { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}

export function startRun(command: string, detail: string): RunLog {
  const runsDir = join(homedir(), '.ai-bridge', 'runs');
  try {
    mkdirSync(runsDir, { recursive: true });
    pruneOldRuns(runsDir);

    const id = `${getTimestamp()}-${command}-${randomBytes(2).toString('hex')}`;
    const dir = join(runsDir, id);
    mkdirSync(dir, { recursive: true });

    const meta: RunMeta = {
      id,
      command,
      detail,
      pid: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'running',
      exitCode: null,
    };

    const metaJsonPath = join(dir, 'meta.json');
    const stdoutLogPath = join(dir, 'stdout.log');
    const stderrLogPath = join(dir, 'stderr.log');

    writeFileSync(metaJsonPath, JSON.stringify(meta, null, 2), 'utf8');
    writeFileSync(stdoutLogPath, '', 'utf8');
    writeFileSync(stderrLogPath, '', 'utf8');

    return {
      id,
      dir,
      setPid(pid: number) {
        try {
          meta.pid = pid;
          writeFileSync(metaJsonPath, JSON.stringify(meta, null, 2), 'utf8');
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
      },
      stderr(chunk: string) {
        try {
          appendFileSync(stderrLogPath, chunk, 'utf8');
        } catch {
          // ignore
        }
      },
      finish(status: 'done' | 'error' | 'timeout', exitCode: number | null) {
        try {
          meta.status = status;
          meta.exitCode = exitCode;
          meta.endedAt = new Date().toISOString();
          writeFileSync(metaJsonPath, JSON.stringify(meta, null, 2), 'utf8');
        } catch {
          // ignore
        }
      },
    };
  } catch {
    return {
      id: '',
      dir: '',
      setPid() {},
      stdout() {},
      stderr() {},
      finish() {},
    };
  }
}

export function listRuns(): RunMeta[] {
  const runsDir = join(homedir(), '.ai-bridge', 'runs');
  if (!existsSync(runsDir)) return [];
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
            // This command monitors ai-bridge CLI runs only — skip entries
            // whose meta.json lacks the CLI shape (no `detail`/`command`)
            // instead of crashing — other tools may have written runs here historically.
            if (
              parsed &&
              typeof parsed === 'object' &&
              parsed.id &&
              parsed.startedAt &&
              typeof parsed.detail === 'string'
            ) {
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

export function readRunLogs(id: string): { meta: RunMeta; stdout: string; stderr: string } | null {
  const runsDir = join(homedir(), '.ai-bridge', 'runs');
  const dir = join(runsDir, id);
  const metaPath = join(dir, 'meta.json');
  const stdoutPath = join(dir, 'stdout.log');
  const stderrPath = join(dir, 'stderr.log');
  if (!existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as RunMeta;
    const stdout = existsSync(stdoutPath) ? readFileSync(stdoutPath, 'utf8') : '';
    const stderr = existsSync(stderrPath) ? readFileSync(stderrPath, 'utf8') : '';
    return { meta, stdout, stderr };
  } catch {
    return null;
  }
}
