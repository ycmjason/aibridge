import { buildCommand } from '@stricli/core';
import quotaImpl from './impl.ts';

const fullDescription = [
  'grok: reads ~/.grok/auth.json and asks the xAI billing endpoint for the',
  'weekly credit usage percentage and per-product split.',
  'agy: reads its cached OAuth token (~/.gemini/antigravity-cli/) and asks the',
  'Cloud Code API for per-model remaining quota. EXHAUSTED means agy turns on',
  'that model fail with an empty answer until the reset time.',
  'codex: reads ~/.codex/auth.json and asks the ChatGPT usage endpoint for the',
  '5-hour and weekly windows (used % + reset). No separate logins for either.',
  'claude: shells out to `claude -p "/usage"` (the slow leg, ~5-10s) and parses',
  'the session + weekly windows — no HTTP endpoint exists and we never touch',
  'the Keychain; the claude CLI uses its own credentials.',
].join('\n');

export const quota = buildCommand({
  func: quotaImpl,
  parameters: {
    flags: {
      json: {
        kind: 'boolean',
        withNegated: false,
        brief: 'Emit the raw snapshot as JSON',
      },
    },
  },
  docs: {
    brief: 'Show grok / agy / codex / claude quota with reset times',
    fullDescription,
  },
});
