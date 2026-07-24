import { runCaptured } from '@ai-bridge/proc';

export interface ClaudeQuotaWindow {
  readonly window: string;
  readonly usedPercent: number;
  readonly resetsText: string;
}

export interface ClaudeQuotaSnapshot {
  readonly fetchedAt: string;
  readonly windows: readonly ClaudeQuotaWindow[];
}

const WINDOW_RE = /^Current (session|week \([^)]+\)):\s+(\d+)% used(?:\s*·\s*resets\s+(.+))?$/;

export function parseClaudeUsageOutput(stdout: string): ClaudeQuotaWindow[] {
  const windows: ClaudeQuotaWindow[] = [];
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(WINDOW_RE);
    if (!m || m[1] === undefined || m[2] === undefined) continue;
    windows.push({
      window: m[1],
      usedPercent: Number(m[2]),
      resetsText: m[3]?.trim() ?? '',
    });
  }
  return windows;
}

export async function fetchClaudeQuota(): Promise<ClaudeQuotaSnapshot> {
  const result = await runCaptured('claude', ['-p', '/usage'], { timeoutMs: 90_000 });
  if (result.timedOut) throw new Error('claude -p "/usage" timed out');
  if (result.code !== 0) {
    throw new Error(`claude -p "/usage" exited ${result.code}`);
  }
  const windows = parseClaudeUsageOutput(result.stdout);
  if (windows.length === 0) {
    throw new Error('could not parse any usage windows from claude /usage output (format change?)');
  }
  return { fetchedAt: new Date().toISOString(), windows };
}
