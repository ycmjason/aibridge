import { describe, expect, it } from 'vitest';
import type { LocalContext } from '../../context.ts';
import { MODELS } from '../../models.ts';
import modelsImpl from './impl.ts';

function createTestContext() {
  let stdoutText = '';
  const fakeProcess = {
    stdout: {
      write(chunk: string | Uint8Array) {
        stdoutText += chunk.toString();
        return true;
      },
    },
    stderr: {
      write() {
        return true;
      },
    },
    exitCode: 0,
  } as unknown as NodeJS.Process;

  return {
    ctx: { process: fakeProcess } as LocalContext,
    getStdout: () => stdoutText,
  };
}

describe('modelsImpl', () => {
  it('--json emits parseable JSON with one entry per key of MODELS, with eight documented fields', () => {
    const { ctx, getStdout } = createTestContext();
    modelsImpl.call(ctx, { json: true });

    const raw = getStdout();
    const data = JSON.parse(raw);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(Object.keys(MODELS).length);

    for (const item of data) {
      expect(item).toHaveProperty('slug');
      expect(item).toHaveProperty('backend');
      expect(item).toHaveProperty('backendModel');
      expect(item).toHaveProperty('efforts');
      expect(item).toHaveProperty('defaultEffort');
      expect(item).toHaveProperty('image');
      expect(item).toHaveProperty('imageAlpha');
      expect(item).toHaveProperty('brief');
      expect(Object.keys(item)).toHaveLength(8);
    }
  });

  it('reports efforts: ["low", "high"] and defaultEffort: "high" for gemini-3.1-pro in JSON', () => {
    const { ctx, getStdout } = createTestContext();
    modelsImpl.call(ctx, { json: true });

    const data = JSON.parse(getStdout());
    const geminiPro = data.find(
      (item: { slug: string }) => item.slug === 'google-antigravity/gemini-3.1-pro',
    );
    expect(geminiPro).toBeDefined();
    expect(geminiPro.efforts).toEqual(['low', 'high']);
    expect(geminiPro.defaultEffort).toBe('high');
  });

  it('reports backendModel, image, and imageAlpha correctly for opus-5 and gpt-5.6-sol in JSON', () => {
    const { ctx, getStdout } = createTestContext();
    modelsImpl.call(ctx, { json: true });

    const data = JSON.parse(getStdout());
    const opus = data.find((item: { slug: string }) => item.slug === 'anthropic-claude/opus-5');
    expect(opus).toBeDefined();
    expect(opus.backendModel).toBe('claude-opus-5[1m]');
    expect(opus.image).toBeNull();
    expect(opus.imageAlpha).toBeNull();

    const sol = data.find((item: { slug: string }) => item.slug === 'openai-codex/gpt-5.6-sol');
    expect(sol).toBeDefined();
    expect(sol.image).toBe('png');
    expect(sol.imageAlpha).toBe('native');
  });

  it('human output (no --json) contains every slug in MODELS', () => {
    const { ctx, getStdout } = createTestContext();
    modelsImpl.call(ctx, { json: false });

    const output = getStdout();
    for (const slug of Object.keys(MODELS)) {
      expect(output).toContain(slug);
    }
  });
});
