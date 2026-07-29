import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isAuthExpired } from '@aibridge/proc';
import { test } from 'vitest';
import { fetchGrokQuota, parseGrokBilling } from './grokQuota.ts';

function writeAuthFixture(path: string, key: string): void {
  writeFileSync(
    path,
    JSON.stringify({
      'https://auth.x.ai::test': { key, user_id: 'u1' },
    }),
  );
}

function authHeaderFromInit(init?: RequestInit): string | undefined {
  const headers = init?.headers;
  if (!headers || Array.isArray(headers)) return undefined;
  if (headers instanceof Headers) return headers.get('Authorization') ?? undefined;
  return (headers as Record<string, string>).Authorization;
}

test('parseGrokBilling with verified realistic payload fixture', () => {
  const data = {
    config: {
      currentPeriod: {
        type: 'USAGE_PERIOD_TYPE_WEEKLY',
        start: '2026-07-23T10:08:31.372022+00:00',
        end: '2026-07-30T10:08:31.372022+00:00',
      },
      creditUsagePercent: 17.0,
      onDemandCap: { val: 0 },
      onDemandUsed: { val: 0 },
      productUsage: [
        { product: 'GrokBuild', usagePercent: 16.0 },
        { product: 'Api', usagePercent: 1.0 },
      ],
      isUnifiedBillingUser: true,
      prepaidBalance: { val: 0 },
      topUpMethod: 'TOP_UP_METHOD_SAVED_PAYMENT_METHOD',
      billingPeriodStart: '2026-07-23T10:08:31.372022+00:00',
      billingPeriodEnd: '2026-07-30T10:08:31.372022+00:00',
    },
  };

  const snapshot = parseGrokBilling(data);
  assert.strictEqual(snapshot.usedPercent, 17.0);
  assert.strictEqual(snapshot.periodType, 'weekly');
  assert.strictEqual(snapshot.periodStart, '2026-07-23T10:08:31.372022+00:00');
  assert.strictEqual(snapshot.periodEnd, '2026-07-30T10:08:31.372022+00:00');
  assert.strictEqual(snapshot.products.length, 2);
  assert.deepEqual(snapshot.products[0], { product: 'GrokBuild', usedPercent: 16.0 });
  assert.deepEqual(snapshot.products[1], { product: 'Api', usedPercent: 1.0 });
  assert.strictEqual(snapshot.onDemandCapCents, 0);
  assert.strictEqual(snapshot.onDemandUsedCents, 0);
  assert.strictEqual(snapshot.prepaidBalanceCents, 0);
});

test('parseGrokBilling with legacy shape calculating usedPercent', () => {
  const data = {
    config: {
      used: { val: 250 },
      monthlyLimit: { val: 1000 },
    },
  };

  const snapshot = parseGrokBilling(data);
  assert.strictEqual(snapshot.usedPercent, 25.0);
});

test('parseGrokBilling with empty config', () => {
  const snapshot = parseGrokBilling({ config: {} });
  assert.strictEqual(snapshot.usedPercent, undefined);
  assert.deepEqual(snapshot.products, []);
  assert.strictEqual(snapshot.periodType, undefined);
  assert.strictEqual(snapshot.periodStart, undefined);
  assert.strictEqual(snapshot.periodEnd, undefined);
  assert.strictEqual(snapshot.onDemandUsedCents, undefined);
  assert.strictEqual(snapshot.onDemandCapCents, undefined);
  assert.strictEqual(snapshot.prepaidBalanceCents, undefined);
});

test('parseGrokBilling with proto3 zero omission (empty object for Cent)', () => {
  const data = {
    config: {
      onDemandUsed: {},
    },
  };

  const snapshot = parseGrokBilling(data);
  assert.strictEqual(snapshot.onDemandUsedCents, 0);
});

test('fetchGrokQuota: 401 then refresh once then 200 re-reads auth key', async () => {
  const authPath = join(tmpdir(), `aibridge-grok-auth-${Date.now()}-heal.json`);
  writeAuthFixture(authPath, 'old-key');
  process.env.GROK_AUTH_PATH = authPath;

  const authHeaders: string[] = [];
  let calls = 0;
  let refreshCalls = 0;

  const fetchImpl: typeof fetch = async (_url, init) => {
    calls += 1;
    const auth = authHeaderFromInit(init);
    if (auth) authHeaders.push(auth);
    if (calls === 1) {
      return new Response('', { status: 401 });
    }
    return new Response(
      JSON.stringify({
        config: {
          creditUsagePercent: 17.0,
          currentPeriod: {
            type: 'USAGE_PERIOD_TYPE_WEEKLY',
            start: '2026-07-23T10:08:31.372022+00:00',
            end: '2026-07-30T10:08:31.372022+00:00',
          },
          productUsage: [{ product: 'GrokBuild', usagePercent: 16.0 }],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const refresh = async () => {
    refreshCalls += 1;
    writeAuthFixture(authPath, 'new-key');
  };

  try {
    const snapshot = await fetchGrokQuota(fetchImpl, refresh);
    assert.strictEqual(refreshCalls, 1);
    assert.strictEqual(calls, 2);
    assert.deepEqual(authHeaders, ['Bearer old-key', 'Bearer new-key']);
    assert.strictEqual(snapshot.usedPercent, 17.0);
    assert.strictEqual(snapshot.periodType, 'weekly');
    assert.deepEqual(snapshot.products[0], { product: 'GrokBuild', usedPercent: 16.0 });
  } finally {
    delete process.env.GROK_AUTH_PATH;
  }
});

test('fetchGrokQuota: 401 twice throws AuthExpiredError', async () => {
  const authPath = join(tmpdir(), `aibridge-grok-auth-${Date.now()}-fail.json`);
  writeAuthFixture(authPath, 'stale-key');
  process.env.GROK_AUTH_PATH = authPath;

  let refreshCalls = 0;
  const fetchImpl: typeof fetch = async () => new Response('', { status: 401 });
  const refresh = async () => {
    refreshCalls += 1;
  };

  try {
    await assert.rejects(
      () => fetchGrokQuota(fetchImpl, refresh),
      (err: unknown) => {
        assert.ok(isAuthExpired(err));
        assert.strictEqual(
          (err as Error).message,
          'grok session expired (401) — run `grok login`, then retry',
        );
        return true;
      },
    );
    assert.strictEqual(refreshCalls, 1);
  } finally {
    delete process.env.GROK_AUTH_PATH;
  }
});

test('fetchGrokQuota: 200 first time never calls refresh', async () => {
  const authPath = join(tmpdir(), `aibridge-grok-auth-${Date.now()}-ok.json`);
  writeAuthFixture(authPath, 'good-key');
  process.env.GROK_AUTH_PATH = authPath;

  let refreshCalls = 0;
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ config: { creditUsagePercent: 5 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const refresh = async () => {
    refreshCalls += 1;
  };

  try {
    const snapshot = await fetchGrokQuota(fetchImpl, refresh);
    assert.strictEqual(calls, 1);
    assert.strictEqual(refreshCalls, 0);
    assert.strictEqual(snapshot.usedPercent, 5);
  } finally {
    delete process.env.GROK_AUTH_PATH;
  }
});
