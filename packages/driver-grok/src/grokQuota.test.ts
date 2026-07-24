import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseGrokBilling } from './grokQuota.ts';

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
