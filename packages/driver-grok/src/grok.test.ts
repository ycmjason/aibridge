import assert from 'node:assert/strict';
import type { RunResult } from '@aibridge/proc';
import { describe, expect, it, test } from 'vitest';
import { buildGrokPrintArgs, refreshGrokAuth } from './grok.ts';

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

  it('assembles headless tools allowlist and max-turns', () => {
    const args = buildGrokPrintArgs('draw a cat', {
      model: 'grok-4.6',
      skipPermissions: true,
      tools: 'image_gen,image_edit',
      maxTurns: 4,
    });
    expect(args).toEqual([
      '-p',
      'draw a cat',
      '--model',
      'grok-4.6',
      '--permission-mode',
      'bypassPermissions',
      '--tools',
      'image_gen,image_edit',
      '--max-turns',
      '4',
    ]);
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
