import { describe, expect, it } from 'vitest';
import { buildAgyPrintArgs } from './agy.ts';

describe('buildAgyPrintArgs', () => {
  it('assembles default agy args', () => {
    const args = buildAgyPrintArgs('test prompt', {
      model: 'gemini-3.6-flash-high',
      printTimeoutSec: 600,
    });
    expect(args).toEqual([
      '-p',
      'test prompt',
      '--model',
      'gemini-3.6-flash-high',
      '--print-timeout',
      '600s',
    ]);
  });

  it('preserves order of skipPermissions and addDirs', () => {
    const args = buildAgyPrintArgs('test prompt', {
      model: 'gemini-3.6-flash-high',
      printTimeoutSec: 600,
      skipPermissions: true,
      addDirs: ['/work/repo', '/tmp/answer-dir'],
    });
    expect(args).toEqual([
      '-p',
      'test prompt',
      '--model',
      'gemini-3.6-flash-high',
      '--print-timeout',
      '600s',
      '--dangerously-skip-permissions',
      '--add-dir',
      '/work/repo',
      '--add-dir',
      '/tmp/answer-dir',
    ]);
  });
});
