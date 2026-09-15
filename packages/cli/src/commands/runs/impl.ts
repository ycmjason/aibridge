import type { LocalContext } from '../../context.ts';
import { listRuns, type RunStoreOptions, readRunLogs } from '../../runlog.ts';

export interface RunsFlags {
  readonly watch: boolean;
  readonly json: boolean;
}

export function formatElapsed(
  startedAtStr: string,
  endedAtStr: string | null,
  nowMs?: number,
): string {
  const start = new Date(startedAtStr).getTime();
  const end = endedAtStr ? new Date(endedAtStr).getTime() : (nowMs ?? Date.now());
  if (Number.isNaN(start) || Number.isNaN(end)) return '-';
  const diffSec = Math.max(0, Math.floor((end - start) / 1000));
  if (diffSec < 60) {
    return `${diffSec}s`;
  }
  const min = Math.floor(diffSec / 60);
  const sec = diffSec % 60;
  return `${min}m${sec}s`;
}

export function formatIdle(lastActivityAtStr: string, nowMs?: number): string {
  const last = new Date(lastActivityAtStr).getTime();
  const now = nowMs ?? Date.now();
  if (Number.isNaN(last) || Number.isNaN(now)) return '-';
  const diffSec = Math.max(0, Math.floor((now - last) / 1000));
  if (diffSec < 60) {
    return `${diffSec}s`;
  }
  const min = Math.floor(diffSec / 60);
  const sec = diffSec % 60;
  return `${min}m${sec}s`;
}

export function statusLabel(status: string): string {
  return status.toUpperCase();
}

export default async function runs(
  this: LocalContext,
  flags: RunsFlags,
  idPrefix?: string,
  storeOpts?: RunStoreOptions,
): Promise<void> {
  if (idPrefix !== undefined) {
    const all = listRuns(storeOpts);
    const matches = all.filter(r => r.id.startsWith(idPrefix));
    if (matches.length === 0) {
      this.process.stderr.write(`aibridge runs: no run matches prefix "${idPrefix}"\n`);
      this.process.exitCode = 1;
      return;
    }
    if (matches.length > 1) {
      this.process.stderr.write(
        `aibridge runs: ambiguous prefix "${idPrefix}" matches:\n${matches.map(m => `  ${m.id}`).join('\n')}\n`,
      );
      this.process.exitCode = 1;
      return;
    }
    const target = matches[0];
    if (target === undefined) return;
    const logs = readRunLogs(target.id, storeOpts);
    if (!logs) {
      this.process.stderr.write(`aibridge runs: failed to read logs for run "${target.id}"\n`);
      this.process.exitCode = 1;
      return;
    }

    const status = statusLabel(logs.meta.status);
    const elapsed = formatElapsed(logs.meta.startedAt, logs.meta.endedAt);
    const idle = logs.meta.status === 'running' ? formatIdle(logs.meta.lastActivityAt) : '-';
    const summaryLines = [
      `ID:      ${logs.meta.id}`,
      `COMMAND: ${logs.meta.command}`,
      `STATUS:  ${status}`,
      `ELAPSED: ${elapsed}`,
      `LAST:    ${logs.meta.lastActivityAt} (${idle})`,
      `DETAIL:  ${logs.meta.detail}`,
    ];
    if (logs.meta.pid !== null) {
      summaryLines.push(`PID:     ${logs.meta.pid}`);
    }
    if (logs.meta.exitCode !== null) {
      summaryLines.push(`EXIT:    ${logs.meta.exitCode}`);
    }
    this.process.stdout.write(`${summaryLines.join('\n')}\n\n`);

    const stdoutLines = logs.stdout.split('\n');
    if (stdoutLines.length > 1 && stdoutLines[stdoutLines.length - 1] === '') {
      stdoutLines.pop();
    }
    const lastStdout = stdoutLines.slice(-40).join('\n');
    this.process.stdout.write(`${lastStdout}\n`);

    if (logs.stderr.trim().length > 0) {
      const stderrLines = logs.stderr.split('\n');
      if (stderrLines.length > 1 && stderrLines[stderrLines.length - 1] === '') {
        stderrLines.pop();
      }
      const lastStderr = stderrLines.slice(-10).join('\n');
      this.process.stdout.write(`\n--- stderr (last 10 lines) ---\n${lastStderr}\n`);
    }
    return;
  }

  if (flags.watch) {
    const update = () => {
      this.process.stdout.write('\x1b[2J\x1b[H');
      const timeStr = new Date().toLocaleTimeString();
      this.process.stdout.write(`aibridge runs — ${timeStr} (ctrl-c to quit)\n\n`);

      const runs = listRuns(storeOpts);
      if (runs.length === 0) {
        this.process.stdout.write('no runs yet\n');
        return;
      }

      const limit = runs.slice(0, 10);
      this.process.stdout.write(
        `${'STATUS'.padEnd(10)} ${'ID'.padEnd(35)} ${'ELAPSED'.padEnd(10)} ${'IDLE'.padEnd(8)} DETAIL\n`,
      );
      for (const r of limit) {
        const status = statusLabel(r.status);
        const elapsed = formatElapsed(r.startedAt, r.endedAt);
        const idle = r.status === 'running' ? formatIdle(r.lastActivityAt) : '-';
        const detail = r.detail.replace(/\r?\n/g, ' ');
        const truncatedDetail = detail.length > 60 ? `${detail.slice(0, 57)}...` : detail;
        this.process.stdout.write(
          `${status.padEnd(10)} ${r.id.padEnd(35)} ${elapsed.padEnd(10)} ${idle.padEnd(8)} ${truncatedDetail}\n`,
        );
      }

      const runningRuns = runs.filter(r => r.status === 'running');
      for (const r of runningRuns) {
        const logs = readRunLogs(r.id, storeOpts);
        if (logs) {
          this.process.stdout.write(`\n--- stdout: ${r.id} ---\n`);
          const lines = logs.stdout.split('\n');
          if (lines.length > 1 && lines[lines.length - 1] === '') {
            lines.pop();
          }
          const lastSix = lines.slice(-6).join('\n');
          this.process.stdout.write(`${lastSix}\n`);
        }
      }
    };

    update();
    setInterval(update, 2000);
    return new Promise<void>(() => {});
  }

  const runs = listRuns(storeOpts);
  if (runs.length === 0) {
    this.process.stdout.write('no runs yet\n');
    return;
  }

  if (flags.json) {
    const limit = runs.slice(0, 20);
    for (const r of limit) {
      this.process.stdout.write(`${JSON.stringify(r)}\n`);
    }
    return;
  }

  const limit = runs.slice(0, 20);
  this.process.stdout.write(
    `${'STATUS'.padEnd(10)} ${'ID'.padEnd(35)} ${'ELAPSED'.padEnd(10)} ${'IDLE'.padEnd(8)} DETAIL\n`,
  );
  for (const r of limit) {
    const status = statusLabel(r.status);
    const elapsed = formatElapsed(r.startedAt, r.endedAt);
    const idle = r.status === 'running' ? formatIdle(r.lastActivityAt) : '-';
    const detail = r.detail.replace(/\r?\n/g, ' ');
    const truncatedDetail = detail.length > 60 ? `${detail.slice(0, 57)}...` : detail;
    this.process.stdout.write(
      `${status.padEnd(10)} ${r.id.padEnd(35)} ${elapsed.padEnd(10)} ${idle.padEnd(8)} ${truncatedDetail}\n`,
    );
  }
}
