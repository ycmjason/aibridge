/**
 * Claude Code subscription quota via the CLI itself: `claude -p "/usage"`
 * renders the real usage panel in print mode (verified 2026-07-03) —
 * deterministic CLI output, not model text. This is the only sanctioned
 * programmatic path: there is no HTTP endpoint for subscription quota
 * (open feature request anthropics/claude-code#44328), and the OAuth token
 * lives in the macOS Keychain, which this tool deliberately never reads.
 * The claude CLI uses its own credentials; we only parse its stdout.
 *
 * Parsed lines look like:
 *   Current session: 11% used · resets Jul 3 at 2:30pm (Europe/London)
 *   Current week (all models): 38% used · resets Jul 7 at 5am (Europe/London)
 *   Current week (Fable): 63% used · resets Jul 7 at 5am (Europe/London)
 *
 * The format is CLI-version-dependent — parse defensively and fail loudly
 * when no window lines match, so a format change surfaces as "unavailable"
 * rather than silent zeros.
 */

import { runCaptured } from './proc.ts';

export interface ClaudeQuotaWindow {
  /** e.g. "session", "week (all models)", "week (Fable)". */
  readonly window: string;
  readonly usedPercent: number;
  /** Human reset text as printed by the CLI (kept verbatim). */
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
