import assert from 'node:assert/strict';
import type { AgyQuotaSnapshot } from '@aibridge/driver-agy';
import type { CodexQuotaSnapshot } from '@aibridge/driver-codex';
import type { GrokQuotaSnapshot } from '@aibridge/driver-grok';
import { test } from 'vitest';
import {
  evaluateAgyPreflight,
  evaluateCodexPreflight,
  evaluateGrokPreflight,
  renderPreflightRefusal,
} from './quotaPreflight.ts';

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
    kind: 'quota',
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
    kind: 'quota',
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

test('evaluateGrokPreflight: usedPercent at 100 refuses with resetAt', () => {
  const snapshot: GrokQuotaSnapshot = {
    fetchedAt: '2024-01-01T12:00:00Z',
    periodType: 'weekly',
    periodStart: '2024-01-01T00:00:00Z',
    periodEnd: '2024-01-08T00:00:00Z',
    usedPercent: 100,
    products: [],
    onDemandUsedCents: undefined,
    onDemandCapCents: undefined,
    prepaidBalanceCents: undefined,
  };

  const result = evaluateGrokPreflight(snapshot);

  assert.deepEqual(result, {
    ok: false,
    kind: 'quota',
    message: 'grok credit quota exhausted',
    resetAt: '2024-01-08T00:00:00Z',
  });
});

test('evaluateGrokPreflight: healthy (17% used) returns ok:true', () => {
  const snapshot: GrokQuotaSnapshot = {
    fetchedAt: '2024-01-01T12:00:00Z',
    periodType: 'weekly',
    periodStart: '2024-01-01T00:00:00Z',
    periodEnd: '2024-01-08T00:00:00Z',
    usedPercent: 17,
    products: [],
    onDemandUsedCents: undefined,
    onDemandCapCents: undefined,
    prepaidBalanceCents: undefined,
  };

  const result = evaluateGrokPreflight(snapshot);

  assert.deepEqual(result, { ok: true });
});

test('renderPreflightRefusal: auth kind uses unauthenticated wording', () => {
  const msg = renderPreflightRefusal('plan', {
    kind: 'auth',
    message: 'grok session expired (401) — run `grok login`, then retry',
    resetAt: undefined,
  });
  assert.strictEqual(
    msg,
    'aibridge plan: refusing — grok session expired (401) — run `grok login`, then retry. Running with --no-preflight would only fail unauthenticated later. Or use a different --model.',
  );
});

test('renderPreflightRefusal: image-gen quota refusal points at other image seats', () => {
  const msg = renderPreflightRefusal('image-gen', {
    kind: 'quota',
    message: 'grok credit quota exhausted',
    resetAt: undefined,
  });
  // No claude seat renders images, so the delegation fallback would be dead advice.
  assert.ok(!msg.includes('claude-backend fallback'));
  assert.ok(msg.includes('another image seat'));
  assert.ok(msg.includes('openai-codex/gpt-5.6-sol'));
});

test('renderPreflightRefusal: quota kind keeps override wording', () => {
  const msg = renderPreflightRefusal('subagent', {
    kind: 'quota',
    message: 'grok credit quota exhausted',
    resetAt: undefined,
  });
  assert.strictEqual(
    msg,
    'aibridge subagent: refusing — grok credit quota exhausted. Use --no-preflight to override, or a claude-backend fallback (subagent --model sonnet|opus — bills the Claude subscription).',
  );
});
