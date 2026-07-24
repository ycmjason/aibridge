import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const USAGE_ENDPOINT = 'https://chatgpt.com/backend-api/wham/usage';

export interface CodexQuotaWindow {
  readonly window: string;
  readonly usedPercent: number;
  readonly resetAt: string | undefined;
}

export interface CodexQuotaSnapshot {
  readonly fetchedAt: string;
  readonly planType: string | undefined;
  readonly limitReached: boolean;
  readonly windows: readonly CodexQuotaWindow[];
}

export function codexAuthPath(): string {
  return process.env.CODEX_AUTH_PATH ?? join(homedir(), '.codex', 'auth.json');
}

interface RawWindow {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_at?: number;
}

export interface RawCodexUsage {
  plan_type?: string;
  rate_limit?: {
    limit_reached?: boolean;
    primary_window?: RawWindow;
    secondary_window?: RawWindow;
  };
}

function windowName(limitWindowSeconds: number | undefined): string {
  if (limitWindowSeconds === undefined) return '?';
  const hours = limitWindowSeconds / 3600;
  if (hours <= 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function parseWindow(name: string | undefined, w: RawWindow | undefined): CodexQuotaWindow | null {
  if (!w) return null;
  return {
    window: name ?? windowName(w.limit_window_seconds),
    usedPercent: typeof w.used_percent === 'number' ? w.used_percent : 0,
    resetAt: typeof w.reset_at === 'number' ? new Date(w.reset_at * 1000).toISOString() : undefined,
  };
}

export function parseCodexUsage(data: RawCodexUsage): CodexQuotaSnapshot {
  const windows: CodexQuotaWindow[] = [];
  const primary = parseWindow(undefined, data.rate_limit?.primary_window);
  if (primary) windows.push(primary);
  const secondary = parseWindow(undefined, data.rate_limit?.secondary_window);
  if (secondary) windows.push(secondary);

  return {
    fetchedAt: new Date().toISOString(),
    planType: data.plan_type,
    limitReached: data.rate_limit?.limit_reached ?? false,
    windows,
  };
}

export async function fetchCodexQuota(): Promise<CodexQuotaSnapshot> {
  const raw = readFileSync(codexAuthPath(), 'utf8');
  const auth = JSON.parse(raw) as {
    tokens?: { access_token?: string; account_id?: string };
  };
  const access = auth.tokens?.access_token;
  if (!access) throw new Error('codex auth.json has no tokens.access_token');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${access}`,
    'User-Agent': 'codex-cli',
  };
  if (auth.tokens?.account_id) headers['ChatGPT-Account-Id'] = auth.tokens.account_id;

  const res = await fetch(USAGE_ENDPOINT, { headers });
  if (res.status === 401) {
    throw new Error('codex token expired (401) — run any codex command once to refresh it');
  }
  if (!res.ok) throw new Error(`codex usage endpoint failed: HTTP ${res.status}`);

  return parseCodexUsage((await res.json()) as RawCodexUsage);
}
