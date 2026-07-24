import assert from 'node:assert/strict';
import type { RunResult } from '@ai-bridge/proc';
import { describe, expect, it, test } from 'vitest';
import { buildGrokPrintArgs, probeGrokAuth } from './grok.ts';

const result = (stdout: string): RunResult => ({
  code: 0,
  signal: null,
  stdout,
  stderr: '',
  timedOut: false,
});

describe('buildGrokPrintArgs', () => {
  it('assembles default args without effort', () => {
    const args = buildGrokPrintArgs('hello prompt', { model: 'grok-4.5' });
    expect(args).toEqual(['-p', 'hello prompt', '--model', 'grok-4.5']);
  });

  it('assembles args with reasoning effort', () => {
    const args = buildGrokPrintArgs('hello prompt', {
      model: 'grok-4.5',
      effort: 'medium',
      skipPermissions: true,
    });
    expect(args).toEqual([
      '-p',
      'hello prompt',
      '--model',
      'grok-4.5',
      '--reasoning-effort',
      'medium',
      '--permission-mode',
      'bypassPermissions',
    ]);
  });

  it('assembles headless tools allowlist and max-turns', () => {
    const args = buildGrokPrintArgs('draw a cat', {
      model: 'grok-4.5',
      skipPermissions: true,
      tools: 'image_gen,image_edit',
      maxTurns: 4,
    });
    expect(args).toEqual([
      '-p',
      'draw a cat',
      '--model',
      'grok-4.5',
      '--permission-mode',
      'bypassPermissions',
      '--tools',
      'image_gen,image_edit',
      '--max-turns',
      '4',
    ]);
  });
});

test('authed on first probe — no retry, no sleep', async () => {
  let runs = 0;
  const ok = await probeGrokAuth(
    async (_cmd, args) => {
      runs++;
      assert.deepEqual([...args], ['models']);
      return result('You are logged in with grok.com');
    },
    async () => {
      assert.fail('must not sleep when first probe is authed');
    },
  );
  assert.equal(ok, true);
  assert.equal(runs, 1);
});

test('expired token: unauthed first probe, authed on retry after refresh', async () => {
  let runs = 0;
  const sleeps: number[] = [];
  const ok = await probeGrokAuth(
    async () =>
      result(runs++ === 0 ? 'You are not authenticated.' : 'You are logged in with grok.com'),
    async ms => {
      sleeps.push(ms);
    },
  );
  assert.equal(ok, true);
  assert.equal(runs, 2);
  assert.deepEqual(sleeps, [2_000]);
});

test('unauthed on both probes — genuinely signed out', async () => {
  let runs = 0;
  const ok = await probeGrokAuth(
    async () => {
      runs++;
      return result('You are not authenticated.');
    },
    async () => {},
  );
  assert.equal(ok, false);
  assert.equal(runs, 2);
});
