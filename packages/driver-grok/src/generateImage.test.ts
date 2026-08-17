import type { RunOptions, RunResult } from '@aibridge/proc';
import { describe, expect, it } from 'vitest';
import { generateImage } from './generateImage.ts';

const req = {
  prompt: 'a fox',
  workDir: '/work',
  backendModel: 'grok-4.6',
  aspectRatio: '1:1',
  imagePaths: [],
  timeoutSec: 30,
  forceful: false,
  minBytes: 1000,
} as const;

const fakeExec = (sink: { opts?: RunOptions }) => {
  return async (
    _cmd: string,
    args: readonly string[],
    opts: RunOptions = {},
  ): Promise<RunResult> => {
    const out = args.includes('--version') ? 'grok 1.0.4 (abc) [stable]' : '';
    if (!args.includes('--version')) sink.opts = opts;
    return { code: 0, signal: null, stdout: out, stderr: '', timedOut: false };
  };
};

describe('generateImage env', () => {
  it('pins image_gen/image_edit to Imagine 2.0', async () => {
    const sink: { opts?: RunOptions } = {};
    // Clear the keys first: a developer who exported one to compare tiers should
    // not see a red test for a preference the next case explicitly honours.
    const saved = {
      gen: process.env.GROK_IMAGE_GEN_MODEL_OVERRIDE,
      edit: process.env.GROK_IMAGE_EDIT_MODEL_OVERRIDE,
    };
    delete process.env.GROK_IMAGE_GEN_MODEL_OVERRIDE;
    delete process.env.GROK_IMAGE_EDIT_MODEL_OVERRIDE;
    try {
      await generateImage(req, fakeExec(sink));
      expect(sink.opts?.env?.GROK_IMAGE_GEN_MODEL_OVERRIDE).toBe('grok-imagine-image-2.0');
      expect(sink.opts?.env?.GROK_IMAGE_EDIT_MODEL_OVERRIDE).toBe('grok-imagine-image-2.0');
      // Inherits the real environment rather than replacing it.
      expect(sink.opts?.env?.PATH).toBe(process.env.PATH);
    } finally {
      if (saved.gen !== undefined) process.env.GROK_IMAGE_GEN_MODEL_OVERRIDE = saved.gen;
      if (saved.edit !== undefined) process.env.GROK_IMAGE_EDIT_MODEL_OVERRIDE = saved.edit;
    }
  });

  it('lets an exported override win', async () => {
    const sink: { opts?: RunOptions } = {};
    process.env.GROK_IMAGE_GEN_MODEL_OVERRIDE = 'grok-imagine-image-quality';
    try {
      await generateImage(req, fakeExec(sink));
      expect(sink.opts?.env?.GROK_IMAGE_GEN_MODEL_OVERRIDE).toBe('grok-imagine-image-quality');
    } finally {
      delete process.env.GROK_IMAGE_GEN_MODEL_OVERRIDE;
    }
  });
});
