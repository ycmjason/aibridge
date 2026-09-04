import assert from 'node:assert/strict';
import type { RunResult } from '@aibridge/proc';
import { describe, expect, it, test } from 'vitest';
import { buildGrokPrintArgs, grokEnv, refreshGrokAuth } from './grok.ts';

const result = (stdout: string): RunResult => ({
  code: 0,
  signal: null,
  stdout,
  stderr: '',
  timedOut: false,
});

describe('buildGrokPrintArgs', () => {
  it('assembles default args without effort', () => {
    const args = buildGrokPrintArgs('hello prompt', { model: 'grok-4.6' });
    expect(args).toEqual(['-p', 'hello prompt', '--model', 'grok-4.6']);
  });

  it('assembles args with reasoning effort', () => {
    const args = buildGrokPrintArgs('hello prompt', {
      model: 'grok-4.6',
      effort: 'medium',
      skipPermissions: true,
    });
    expect(args).toEqual([
      '-p',
      'hello prompt',
      '--model',
      'grok-4.6',
      '--reasoning-effort',
      'medium',
      '--permission-mode',
      'bypassPermissions',
    ]);
  });
});

describe('grokEnv', () => {
  it("sets all four Claude-compat keys to '0' and preserves PATH", () => {
    const env = grokEnv();
    expect(env.GROK_CLAUDE_RULES_ENABLED).toBe('0');
    expect(env.GROK_CLAUDE_SKILLS_ENABLED).toBe('0');
    expect(env.GROK_CLAUDE_MCPS_ENABLED).toBe('0');
    expect(env.GROK_CLAUDE_AGENTS_ENABLED).toBe('0');
    expect(env.PATH).toBe(process.env.PATH);
  });
});

test('refreshGrokAuth spawns `grok models` once and ignores its output', async () => {
  let runs = 0;
  await refreshGrokAuth(async (_cmd, args) => {
    runs++;
    assert.deepEqual([...args], ['models']);
    // grok 1.0.4 says this even when signed in — must not be read as a verdict.
    return result('You are not authenticated.');
  });
  assert.equal(runs, 1);
});

test('refreshGrokAuth swallows spawn failures', async () => {
  await refreshGrokAuth(async () => {
    throw new Error('ENOENT');
  });
});
