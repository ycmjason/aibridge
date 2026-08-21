import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isAuthExpired } from '@aibridge/proc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGrokAuth } from './auth.ts';

describe('getGrokAuth', () => {
  let tmpDir: string;
  let authFile: string;
  let savedAuthPath: string | undefined;

  function writeAuth(entry: { key: string; user_id?: string; expires_at?: string }): void {
    writeFileSync(
      authFile,
      JSON.stringify({
        'https://auth.x.ai::test': entry,
      }),
    );
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'grok-auth-test-'));
    authFile = join(tmpDir, 'auth.json');
    savedAuthPath = process.env.GROK_AUTH_PATH;
    process.env.GROK_AUTH_PATH = authFile;
  });

  afterEach(() => {
    if (savedAuthPath !== undefined) {
      process.env.GROK_AUTH_PATH = savedAuthPath;
    } else {
      delete process.env.GROK_AUTH_PATH;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('expires_at an hour in the future → refresh not called', async () => {
    writeAuth({
      key: 'fresh-key',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    const refresh = vi.fn(async () => {});
    const auth = await getGrokAuth(refresh);
    expect(refresh).not.toHaveBeenCalled();
    expect(auth.key).toBe('fresh-key');
  });

  it('expires_at in the past → refresh once, returns re-read record', async () => {
    writeAuth({
      key: 'stale-key',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const refresh = vi.fn(async () => {
      writeAuth({
        key: 'new-key',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
    });
    const auth = await getGrokAuth(refresh);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(auth.key).toBe('new-key');
  });

  it('still expired after refresh → rejects with AuthExpiredError', async () => {
    writeAuth({
      key: 'stale-key',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const refresh = vi.fn(async () => {
      writeAuth({
        key: 'still-stale',
        expires_at: new Date(Date.now() - 30_000).toISOString(),
      });
    });
    await expect(getGrokAuth(refresh)).rejects.toSatisfy((err: unknown) => isAuthExpired(err));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('no expires_at → refresh not called', async () => {
    writeAuth({ key: 'api-key-mode' });
    const refresh = vi.fn(async () => {});
    const auth = await getGrokAuth(refresh);
    expect(refresh).not.toHaveBeenCalled();
    expect(auth.key).toBe('api-key-mode');
  });

  it('expires_at 30s ahead (inside skew) → treated as expired, refresh once', async () => {
    writeAuth({
      key: 'near-expiry',
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    });
    const refresh = vi.fn(async () => {
      writeAuth({
        key: 'refreshed-key',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
    });
    const auth = await getGrokAuth(refresh);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(auth.key).toBe('refreshed-key');
  });
});
