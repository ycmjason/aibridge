import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseClaudeUsageOutput } from './claudeQuota.ts';

test('parseClaudeUsageOutput extracts session and weekly windows', () => {
  const stdout = [
    'You are currently using your subscription to power your Claude Code usage',
    '',
    'Current session: 11% used · resets Jul 3 at 2:30pm (Europe/London)',
    'Current week (all models): 38% used · resets Jul 7 at 5am (Europe/London)',
    'Current week (Fable): 63% used · resets Jul 7 at 5am (Europe/London)',
    '',
    "What's contributing to your limits usage?",
    'Last 24h · 3629 requests · 35 sessions',
    '  82% of your usage was at >150k context',
  ].join('\n');

  const windows = parseClaudeUsageOutput(stdout);
  assert.deepEqual(windows, [
    {
      window: 'session',
      usedPercent: 11,
      resetsText: 'Jul 3 at 2:30pm (Europe/London)',
    },
    {
      window: 'week (all models)',
      usedPercent: 38,
      resetsText: 'Jul 7 at 5am (Europe/London)',
    },
    {
      window: 'week (Fable)',
      usedPercent: 63,
      resetsText: 'Jul 7 at 5am (Europe/London)',
    },
  ]);
});

test('parseClaudeUsageOutput returns empty on unrecognized output', () => {
  assert.deepEqual(parseClaudeUsageOutput('I have used some tokens today.'), []);
});
