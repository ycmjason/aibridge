import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { fetchCodexQuota, parseCodexUsage } from './codexQuota.ts';

test('parseCodexUsage with realistic payload', () => {
  const data = {
    plan_type: 'plus',
    rate_limit: {
      limit_reached: false,
      primary_window: {
        used_percent: 12.5,
        limit_window_seconds: 18000,
        reset_at: 1751629781,
      },
      secondary_window: {
        used_percent: 64,
        limit_window_seconds: 604800,
        reset_at: 1751989145,
      },
    },
  };

  const snapshot = parseCodexUsage(data);
  assert.equal(snapshot.planType, 'plus');
  assert.equal(snapshot.limitReached, false);
  assert.deepEqual(snapshot.windows, [
    {
      window: '5h',
      usedPercent: 12.5,
      resetAt: new Date(1751629781 * 1000).toISOString(),
    },
    {
      window: '7d',
      usedPercent: 64,
      resetAt: new Date(1751989145 * 1000).toISOString(),
    },
  ]);
});

test('parseCodexUsage with empty payload', () => {
  const snapshot = parseCodexUsage({});
  assert.equal(snapshot.planType, undefined);
  assert.equal(snapshot.limitReached, false);
  assert.deepEqual(snapshot.windows, []);
});

test('fetchCodexQuota refreshes the codex session once on 401 and retries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aibridge-codex-auth-'));
  const authPath = join(dir, 'auth.json');
  writeFileSync(authPath, JSON.stringify({ tokens: { access_token: 'stale' } }));
  process.env.CODEX_AUTH_PATH = authPath;

  const statuses = [401, 200];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const status = statuses.shift() ?? 200;
    return {
      status,
      ok: status === 200,
      json: async () => ({ plan_type: 'plus' }),
    } as Response;
  }) as typeof fetch;

  const calls: string[][] = [];
  try {
    const snapshot = await fetchCodexQuota(async (cmd, args) => {
      calls.push([cmd, ...args]);
      // The real refresh rewrites auth.json; here the retry just needs to happen.
      return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false };
    });
    assert.deepEqual(calls, [['codex', 'mcp', 'list']]);
    assert.equal(snapshot.planType, 'plus');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.CODEX_AUTH_PATH;
  }
});

test('parseCodexUsage with window missing used_percent and reset_at', () => {
  const data = {
    rate_limit: {
      primary_window: {
        limit_window_seconds: 18000,
      },
    },
  };

  const snapshot = parseCodexUsage(data);
  assert.deepEqual(snapshot.windows, [
    {
      window: '5h',
      usedPercent: 0,
      resetAt: undefined,
    },
  ]);
});
