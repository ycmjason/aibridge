import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AuthExpiredError } from '@aibridge/proc';

export interface GrokAuthRecord {
  readonly key: string;
  readonly userId: string | undefined;
}

interface RawGrokAuthEntry {
  key?: string;
  user_id?: string;
}

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
  };
}
