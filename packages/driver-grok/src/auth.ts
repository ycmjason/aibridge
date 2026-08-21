import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AuthExpiredError } from '@aibridge/proc';
import { refreshGrokAuth } from './grok.ts';

export interface GrokAuthRecord {
  readonly key: string;
  readonly userId: string | undefined;
  readonly expiresAt: string | undefined;
}

interface RawGrokAuthEntry {
  key?: string;
  user_id?: string;
  expires_at?: string;
}

const EXPIRY_SKEW_MS = 120_000;

export function grokAuthPath(): string {
  return process.env.GROK_AUTH_PATH ?? join(homedir(), '.grok', 'auth.json');
}

export function readGrokAuth(): GrokAuthRecord {
  const authPath = grokAuthPath();
  let rawAuth: string;
  try {
    rawAuth = readFileSync(authPath, 'utf8');
  } catch (_err) {
    throw new AuthExpiredError('grok auth.json has no usable session (run `grok login`)');
  }

  let authData: Record<string, RawGrokAuthEntry>;
  try {
    authData = JSON.parse(rawAuth) as Record<string, RawGrokAuthEntry>;
    if (!authData || typeof authData !== 'object') {
      throw new Error('invalid JSON object');
    }
  } catch (_err) {
    throw new AuthExpiredError('grok auth.json has no usable session (run `grok login`)');
  }

  let record: RawGrokAuthEntry | undefined;
  for (const [key, value] of Object.entries(authData)) {
    if (key.startsWith('https://auth.x.ai::')) {
      record = value;
      break;
    }
  }
  if (!record) {
    const firstKey = Object.keys(authData)[0];
    if (firstKey) {
      record = authData[firstKey];
    }
  }

  if (!record?.key) {
    throw new AuthExpiredError('grok auth.json has no usable session (run `grok login`)');
  }

  return {
    key: record.key,
    userId: record.user_id,
    expiresAt: record.expires_at,
  };
}

/** True when expiresAt is parseable and within EXPIRY_SKEW_MS of now (or already past). Missing/unparseable → false. */
export function isGrokAuthExpired(auth: GrokAuthRecord): boolean {
  if (auth.expiresAt === undefined) return false;
  const ms = Date.parse(auth.expiresAt);
  if (Number.isNaN(ms)) return false;
  return ms - Date.now() <= EXPIRY_SKEW_MS;
}

/**
 * Read auth, refreshing via the grok CLI when expires_at is near/past.
 * Avoids a wasted multi-MB Imagine upload on a stale token, and surfaces a
 * failed refresh as AuthExpiredError instead of looking like a no-op.
 */
export async function getGrokAuth(
  refresh: () => Promise<unknown> = refreshGrokAuth,
): Promise<GrokAuthRecord> {
  const auth = readGrokAuth();
  if (!isGrokAuthExpired(auth)) return auth;
  await refresh();
  const next = readGrokAuth();
  if (isGrokAuthExpired(next)) {
    throw new AuthExpiredError('grok session expired — run `grok login`, then retry');
  }
  return next;
}
