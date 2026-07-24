import assert from 'node:assert/strict';
import type { AgyQuotaSnapshot } from '@ai-bridge/agy';
import type { CodexQuotaSnapshot } from '@ai-bridge/codex';
import { test } from 'vitest';
import { evaluateAgyPreflight, evaluateCodexPreflight } from './quotaPreflight.ts';

test('evaluateAgyPreflight: exhausted model returns ok:false with resetTime', () => {
  const snapshot: AgyQuotaSnapshot = {
    fetchedAt: '2024-01-01T12:00:00Z',
    groups: [],
    models: [
      {
        modelId: 'test-model-id',
        label: 'Gemini 3.5 Flash (High)',
        remainingFraction: 0,
        exhausted: true,
        resetTime: '2024-01-02T12:00:00Z',
      },
    ],
  };

  const result = evaluateAgyPreflight(snapshot, 'Gemini 3.5 Flash (High)');

  assert.deepEqual(result, {
    ok: false,
    message: 'agy model "Gemini 3.5 Flash (High)" is quota-exhausted',
    resetAt: '2024-01-02T12:00:00Z',
  });
});

test('evaluateAgyPreflight: exhausted model with undefined resetTime falls back to Gemini group', () => {
  const snapshot: AgyQuotaSnapshot = {
    fetchedAt: '2024-01-01T12:00:00Z',
    groups: [
      {
        displayName: 'Gemini 3.5 Flash',
        description: undefined,
        buckets: [
          {
            bucketId: 'weekly',
            displayName: 'weekly',
            window: 'weekly',
            remainingFraction: 0,
            resetTime: '2024-01-08T12:00:00Z',
          },
          {
            bucketId: '5h',
            displayName: '5h',
            window: '5h',
            remainingFraction: 0,
            resetTime: '2024-01-01T17:00:00Z',
          },
        ],
      },
    ],
    models: [
      {
        modelId: 'test-model-id',
        label: 'Gemini 3.5 Flash (High)',
        remainingFraction: 0,
        exhausted: true,
        resetTime: undefined,
      },
    ],
  };

  const result = evaluateAgyPreflight(snapshot, 'Gemini 3.5 Flash (High)');

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.message, 'agy model "Gemini 3.5 Flash (High)" is quota-exhausted');
  assert.strictEqual(result.resetAt, '2024-01-01T17:00:00Z');
});

test('evaluateAgyPreflight: healthy model returns ok:true', () => {
  const snapshot: AgyQuotaSnapshot = {
    fetchedAt: '2024-01-01T12:00:00Z',
    groups: [],
    models: [
      {
        modelId: 'test-model-id',
        label: 'Gemini 3.5 Flash (Low)',
        remainingFraction: 0.5,
        exhausted: false,
        resetTime: undefined,
      },
    ],
  };

  const result = evaluateAgyPreflight(snapshot, 'Gemini 3.5 Flash (Low)');

  assert.deepEqual(result, { ok: true });
});

test('evaluateAgyPreflight: model not found returns ok:true with warning', () => {
  const snapshot: AgyQuotaSnapshot = {
    fetchedAt: '2024-01-01T12:00:00Z',
    groups: [],
    models: [],
  };

  const result = evaluateAgyPreflight(snapshot, 'NonExistent Model');

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.warning, 'model "NonExistent Model" not in quota snapshot; proceeding');
});

test('evaluateCodexPreflight: limitReached returns ok:false', () => {
  const snapshot: CodexQuotaSnapshot = {
    fetchedAt: '2024-01-01T12:00:00Z',
    planType: 'pro',
    limitReached: true,
    windows: [
      {
        window: '5h',
        usedPercent: 100,
        resetAt: '2024-01-01T17:00:00Z',
      },
    ],
  };

  const result = evaluateCodexPreflight(snapshot);

  assert.deepEqual(result, {
    ok: false,
    message: 'codex quota limit reached',
    resetAt: '2024-01-01T17:00:00Z',
  });
});

test('evaluateCodexPreflight: window at usedPercent 100 returns ok:false', () => {
  const snapshot: CodexQuotaSnapshot = {
    fetchedAt: '2024-01-01T12:00:00Z',
    planType: 'pro',
    limitReached: false,
    windows: [
      {
        window: '5h',
        usedPercent: 100,
        resetAt: '2024-01-01T17:00:00Z',
      },
      {
        window: 'weekly',
        usedPercent: 50,
        resetAt: '2024-01-08T12:00:00Z',
      },
    ],
  };

  const result = evaluateCodexPreflight(snapshot);

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.message, 'codex quota limit reached');
  assert.strictEqual(result.resetAt, '2024-01-01T17:00:00Z');
});

test('evaluateCodexPreflight: healthy (77% used) returns ok:true', () => {
  const snapshot: CodexQuotaSnapshot = {
    fetchedAt: '2024-01-01T12:00:00Z',
    planType: 'pro',
    limitReached: false,
    windows: [
      {
        window: '5h',
        usedPercent: 77,
        resetAt: '2024-01-01T17:00:00Z',
      },
      {
        window: 'weekly',
        usedPercent: 50,
        resetAt: '2024-01-08T12:00:00Z',
      },
    ],
  };

  const result = evaluateCodexPreflight(snapshot);

  assert.deepEqual(result, { ok: true });
});
