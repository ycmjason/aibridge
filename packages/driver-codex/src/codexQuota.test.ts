import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseCodexUsage } from './codexQuota.ts';

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
