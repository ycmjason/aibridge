/**
 * agy quota via the Google Cloud Code API, reusing agy's OWN cached OAuth
 * token — no separate login. Mechanism learned from
 * github.com/skainguyen1412/antigravity-usage (reimplemented, not vendored):
 *
 *   1. Read `~/.gemini/antigravity-cli/antigravity-oauth-token`
 *      ({ token: { access_token, refresh_token, expiry } }) — agy refreshes
 *      this file itself whenever it runs. If expired, refresh in-memory via
 *      Google's token endpoint with Antigravity's installed-app client
 *      (public by design for installed apps); we NEVER write agy's file.
 *   2. POST cloudcode-pa.googleapis.com/v1internal:loadCodeAssist
 *      (metadata ideType ANTIGRAVITY / pluginType GEMINI) → project id.
 *   3. POST /v1internal:fetchAvailableModels { project } — the
 *      `User-Agent: antigravity` header is MANDATORY (403 without it).
 *      → models keyed by id, each with quotaInfo.remainingFraction (0..1)
 *      and quotaInfo.resetTime (ISO timestamp).
 *
 * Model `label`s match the names agy uses (e.g. "Gemini 3.5 Flash (Low)").
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AGY_CANONICAL_TO_NATIVE } from './registry.ts';

const CLOUDCODE_BASE = 'https://cloudcode-pa.googleapis.com';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const OAUTH_CLIENT_ID =
  process.env.ANTIGRAVITY_OAUTH_CLIENT_ID ??
  '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const OAUTH_CLIENT_SECRET =
  process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET ?? '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';

export interface AgyModelQuota {
  readonly modelId: string;
  readonly label: string;
  readonly remainingFraction: number | undefined;
  readonly exhausted: boolean;
  readonly resetTime: string | undefined;
}

export interface AgyQuotaSnapshot {
  readonly fetchedAt: string;
  readonly groups: readonly AgyQuotaGroup[];
  readonly models: readonly AgyModelQuota[];
}

export interface AgyQuotaBucket {
  readonly bucketId: string;
  readonly displayName: string;
  readonly window: string;
  readonly remainingFraction: number;
  readonly resetTime: string | undefined;
}

export interface AgyQuotaGroup {
  readonly displayName: string;
  readonly description: string | undefined;
  readonly buckets: readonly AgyQuotaBucket[];
}

interface RawBucket {
  bucketId?: string;
  displayName?: string;
  window?: string;
  remainingFraction?: number;
  resetTime?: string;
}

export function parseQuotaGroups(
  groups: readonly { displayName?: string; description?: string; buckets?: RawBucket[] }[],
): AgyQuotaGroup[] {
  return groups.map(g => ({
    displayName: g.displayName ?? '?',
    description: g.description,
    buckets: (g.buckets ?? []).map(b => ({
      bucketId: b.bucketId ?? '?',
      displayName: b.displayName ?? b.window ?? '?',
      window: b.window ?? '?',
      remainingFraction: typeof b.remainingFraction === 'number' ? b.remainingFraction : 0,
      resetTime: typeof b.resetTime === 'string' ? b.resetTime : undefined,
    })),
  }));
}

export function agyTokenPath(): string {
  return (
    process.env.AGY_OAUTH_TOKEN_PATH ??
    join(homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token')
  );
}

interface AgyTokenFile {
  token?: { access_token?: string; refresh_token?: string; expiry?: string };
}

async function getAccessToken(): Promise<string> {
  const raw = readFileSync(agyTokenPath(), 'utf8');
  const parsed = JSON.parse(raw) as AgyTokenFile;
  const access = parsed.token?.access_token;
  const refresh = parsed.token?.refresh_token;
  const expiry = parsed.token?.expiry;
  if (!access) throw new Error('agy token file has no access_token');

  const isExpired = expiry ? new Date(expiry).getTime() - Date.now() < 60_000 : false;
  if (!isExpired) return access;
  if (!refresh) throw new Error('agy token expired and no refresh_token present');

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`agy token refresh failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('agy token refresh returned no access_token');
  return data.access_token;
}

async function cloudcode(access: string, endpoint: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${CLOUDCODE_BASE}/v1internal:${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/json',
      'User-Agent': 'antigravity',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`cloudcode ${endpoint} failed: HTTP ${res.status}`);
  }
  return res.json();
}

interface RawModelInfo {
  displayName?: string;
  label?: string;
  quotaInfo?: { remainingFraction?: number; isExhausted?: boolean; resetTime?: string };
}

function isRelevantModel(modelId: string, m: RawModelInfo): boolean {
  if (modelId.startsWith('chat_') || modelId.startsWith('tab_') || modelId.startsWith('rev')) {
    return false;
  }
  if (modelId.includes('image') || modelId.includes('mquery')) return false;
  return m.quotaInfo !== undefined;
}

export function parseModels(modelsById: Record<string, RawModelInfo>): AgyModelQuota[] {
  const out: AgyModelQuota[] = [];
  for (const [modelId, m] of Object.entries(modelsById)) {
    if (!isRelevantModel(modelId, m)) continue;
    const qi = m.quotaInfo;
    const remainingFraction = typeof qi?.remainingFraction === 'number' ? qi.remainingFraction : 0;
    out.push({
      modelId,
      label: m.displayName ?? m.label ?? modelId,
      remainingFraction,
      exhausted: qi?.isExhausted ?? remainingFraction === 0,
      resetTime: typeof qi?.resetTime === 'string' ? qi.resetTime : undefined,
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label) || a.modelId.localeCompare(b.modelId));
  return out;
}

let cache: { at: number; snapshot: AgyQuotaSnapshot } | null = null;
const CACHE_TTL_MS = 60_000;

export async function fetchAgyQuota(): Promise<AgyQuotaSnapshot> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.snapshot;

  const access = await getAccessToken();
  const load = (await cloudcode(access, 'loadCodeAssist', {
    metadata: { ideType: 'ANTIGRAVITY', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' },
  })) as { cloudaicompanionProject?: string | { id?: string } };

  const proj = load.cloudaicompanionProject;
  const projectId = typeof proj === 'string' ? proj : proj?.id;
  const [modelsRes, summaryRes] = await Promise.all([
    cloudcode(access, 'fetchAvailableModels', projectId ? { project: projectId } : {}) as Promise<{
      models?: Record<string, RawModelInfo>;
    }>,
    cloudcode(access, 'retrieveUserQuotaSummary', projectId ? { project: projectId } : {}).catch(
      () => ({}),
    ) as Promise<{
      groups?: { displayName?: string; description?: string; buckets?: [] }[];
    }>,
  ]);

  const snapshot: AgyQuotaSnapshot = {
    fetchedAt: new Date().toISOString(),
    groups: parseQuotaGroups(summaryRes.groups ?? []),
    models: parseModels(modelsRes.models ?? {}),
  };
  cache = { at: Date.now(), snapshot };
  return snapshot;
}

export function findModelQuota(
  snapshot: AgyQuotaSnapshot,
  labelOrId: string,
): AgyModelQuota | undefined {
  const nativeLabel = AGY_CANONICAL_TO_NATIVE[labelOrId] ?? labelOrId;
  const matches = snapshot.models.filter(
    m =>
      m.label === labelOrId ||
      m.modelId === labelOrId ||
      m.label === nativeLabel ||
      m.modelId === nativeLabel,
  );
  if (matches.length === 0) return undefined;
  return matches.find(m => m.exhausted) ?? matches[0];
}
