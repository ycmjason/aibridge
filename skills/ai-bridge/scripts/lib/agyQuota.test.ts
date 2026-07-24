import assert from 'node:assert/strict';
import { test } from 'vitest';
import { findModelQuota, parseModels, parseQuotaGroups } from './agyQuota.ts';

test('parseQuotaGroups preserves fractions or defaults to 0 if absent', () => {
  const groups = [
    {
      displayName: 'Group 1',
      description: 'Desc 1',
      buckets: [
        {
          bucketId: 'b1',
          displayName: 'Bucket 1',
          window: '5h',
          remainingFraction: 0.75,
          resetTime: '2026-07-04T12:00:00Z',
        },
        {
          bucketId: 'b2',
          displayName: 'Bucket 2',
          window: 'weekly',
          // remainingFraction absent (exhausted)
          resetTime: '2026-07-10T12:00:00Z',
        },
      ],
    },
  ];

  const parsed = parseQuotaGroups(groups);
  assert.deepEqual(parsed, [
    {
      displayName: 'Group 1',
      description: 'Desc 1',
      buckets: [
        {
          bucketId: 'b1',
          displayName: 'Bucket 1',
          window: '5h',
          remainingFraction: 0.75,
          resetTime: '2026-07-04T12:00:00Z',
        },
        {
          bucketId: 'b2',
          displayName: 'Bucket 2',
          window: 'weekly',
          remainingFraction: 0,
          resetTime: '2026-07-10T12:00:00Z',
        },
      ],
    },
  ]);
});

test('parseQuotaGroups with empty input returns empty output', () => {
  assert.deepEqual(parseQuotaGroups([]), []);
});

test('parseModels filters models and parses quota info correctly', () => {
  const models = {
    // Relevant model, normal
    'gemini-3.5-flash-low': {
      displayName: 'Gemini 3.5 Flash (Low)',
      quotaInfo: {
        remainingFraction: 0.8,
        isExhausted: false,
        resetTime: '2026-07-04T13:00:00Z',
      },
    },
    // Relevant model, exhausted (remainingFraction omitted)
    'gemini-3.5-pro-high': {
      displayName: 'Gemini 3.5 Pro (High)',
      quotaInfo: {
        isExhausted: true,
        resetTime: '2026-07-04T14:00:00Z',
      },
    },
    // Irrelevant model (starts with chat_)
    'chat_gemini-3.5': {
      displayName: 'Chat Gemini',
      quotaInfo: {
        remainingFraction: 0.5,
      },
    },
    // Irrelevant model (no quotaInfo)
    'gemini-3.5-no-quota': {
      displayName: 'Gemini No Quota',
    },
  };

  const parsed = parseModels(models);
  assert.deepEqual(parsed, [
    {
      modelId: 'gemini-3.5-flash-low',
      label: 'Gemini 3.5 Flash (Low)',
      remainingFraction: 0.8,
      exhausted: false,
      resetTime: '2026-07-04T13:00:00Z',
    },
    {
      modelId: 'gemini-3.5-pro-high',
      label: 'Gemini 3.5 Pro (High)',
      remainingFraction: 0,
      exhausted: true,
      resetTime: '2026-07-04T14:00:00Z',
    },
  ]);
});

test('findModelQuota hits modelId id-form', () => {
  const snapshot = {
    fetchedAt: '2026-07-24T00:00:00Z',
    groups: [],
    models: [
      {
        modelId: 'gemini-3.6-flash-high',
        label: 'Gemini 3.6 Flash (High)',
        remainingFraction: 0.9,
        exhausted: false,
        resetTime: undefined,
      },
    ],
  };

  const found = findModelQuota(snapshot, 'gemini-3.6-flash-high');
  assert.equal(found?.modelId, 'gemini-3.6-flash-high');
});
