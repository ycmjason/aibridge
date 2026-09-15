import { describe, expect, it } from 'vitest';
import { agySupportsStreamJson, buildAgyPrintArgs } from './agy.ts';

describe('buildAgyPrintArgs', () => {
  it('assembles default agy args', () => {
    const args = buildAgyPrintArgs('test prompt', {
      model: 'gemini-3.7-flash-high',
      printTimeoutSec: 600,
    });
    expect(args).toEqual([
      '-p',
      'test prompt',
      '--model',
      'gemini-3.7-flash-high',
      '--print-timeout',
      '600s',
    ]);
  });

  it('preserves order of skipPermissions and addDirs', () => {
    const args = buildAgyPrintArgs('test prompt', {
      model: 'gemini-3.7-flash-high',
      printTimeoutSec: 600,
      skipPermissions: true,
      addDirs: ['/work/repo', '/tmp/answer-dir'],
    });
    expect(args).toEqual([
      '-p',
      'test prompt',
      '--model',
      'gemini-3.7-flash-high',
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

describe('agySupportsStreamJson', () => {
  it('accepts versions >= 1.2.3 with supported prefix shapes', () => {
    expect(agySupportsStreamJson('agy 1.2.3')).toBe(true);
    expect(agySupportsStreamJson('agy version 1.2.3')).toBe(true);
    expect(agySupportsStreamJson('1.2.3')).toBe(true);
    expect(agySupportsStreamJson('1.3.0')).toBe(true);
  });

  it('rejects versions < 1.2.3', () => {
    expect(agySupportsStreamJson('1.2.2')).toBe(false);
    expect(agySupportsStreamJson('1.1.8')).toBe(false);
    expect(agySupportsStreamJson('agy version 1.0.0')).toBe(false);
  });

  it('rejects null, invalid strings, prereleases, and embedded build strings', () => {
    expect(agySupportsStreamJson(null)).toBe(false);
    expect(agySupportsStreamJson('not-a-version')).toBe(false);
    expect(agySupportsStreamJson('1.2.3-rc.1')).toBe(false);
    expect(agySupportsStreamJson('agy build 2026.09.15 version 1.2.2')).toBe(false);
  });
});
