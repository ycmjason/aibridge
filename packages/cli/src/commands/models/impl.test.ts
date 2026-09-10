import { describe, expect, it } from 'vitest';
import type { LocalContext } from '../../context.ts';
import type { Installed } from '../../installed.ts';
import { MODELS } from '../../models.ts';
import modelsImpl from './impl.ts';

const ALL: Installed = new Map([
  ['grok', { ok: true, version: 'grok 1.0' }],
  ['agy', { ok: true, version: '1.1' }],
  ['codex', { ok: true, version: 'codex-cli 0.1' }],
  ['claude', { ok: true, version: '2.1' }],
]);
const NO_GROK: Installed = new Map([
  ...ALL,
  ['grok', { ok: false, error: 'aibridge: "grok" not found on PATH. Install it.' }],
]);

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
  it('--json emits parseable JSON with one entry per key of MODELS, with the documented fields', async () => {
    const { ctx, getStdout } = createTestContext();
    await modelsImpl.call(ctx, { json: true }, ALL);

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
      expect(item).toHaveProperty('roles');
      expect(item.installed).toBe(true);
      expect(typeof item.version).toBe('string');
      expect(Object.keys(item)).toHaveLength(11);
    }
  });

  it('reports efforts: ["low", "high"] and defaultEffort: "high" for gemini-3.1-pro in JSON', async () => {
    const { ctx, getStdout } = createTestContext();
    await modelsImpl.call(ctx, { json: true }, ALL);

    const data = JSON.parse(getStdout());
    const geminiPro = data.find(
      (item: { slug: string }) => item.slug === 'google-antigravity/gemini-3.1-pro',
    );
    expect(geminiPro).toBeDefined();
    expect(geminiPro.efforts).toEqual(['low', 'high']);
    expect(geminiPro.defaultEffort).toBe('high');
  });

  it('reports backendModel, image, and imageAlpha correctly for opus-5 and gpt-5.6-sol in JSON', async () => {
    const { ctx, getStdout } = createTestContext();
    await modelsImpl.call(ctx, { json: true }, ALL);

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

  it('human output (no --json) contains every slug in MODELS', async () => {
    const { ctx, getStdout } = createTestContext();
    await modelsImpl.call(ctx, { json: false }, ALL);

    const output = getStdout();
    for (const slug of Object.keys(MODELS)) {
      expect(output).toContain(slug);
    }
  });

  it('collapses an absent backend to its install hint and flags it in JSON', async () => {
    const human = createTestContext();
    await modelsImpl.call(human.ctx, { json: false }, NO_GROK);
    expect(human.getStdout()).toContain(
      '=== grok (Grok CLI) — not installed ===\n  "grok" not found on PATH. Install it.',
    );
    expect(human.getStdout()).not.toContain('xai-grok/grok-4.6');
    expect(human.getStdout()).toContain('openai-codex/gpt-5.6-sol');

    const json = createTestContext();
    await modelsImpl.call(json.ctx, { json: true }, NO_GROK);
    const grok = JSON.parse(json.getStdout()).find(
      (i: { slug: string }) => i.slug === 'xai-grok/grok-4.6',
    );
    expect(grok.installed).toBe(false);
    expect(grok.version).toBeNull();
  });
});
