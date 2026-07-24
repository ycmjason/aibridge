import { describe, expect, it } from 'vitest';
import {
  backendModelId,
  formatImageGenModelError,
  formatUnknownModelError,
  listModelHelpLines,
  resolveModel,
  supportsImageGen,
} from './models.ts';

describe('models registry', () => {
  it('resolves canonical slugs', () => {
    const grok = resolveModel('xai-grok/grok-4.5');
    expect(grok).toBeDefined();
    expect(grok?.spec.slug).toBe('xai-grok/grok-4.5');
    expect(grok?.effort).toBeUndefined();

    const gemini = resolveModel('google-antigravity/gemini-3.6-flash');
    expect(gemini).toBeDefined();
    expect(gemini?.spec.slug).toBe('google-antigravity/gemini-3.6-flash');
    expect(gemini?.effort).toBe('high');
  });

  it('rejects short aliases — canonical slugs only', () => {
    for (const alias of ['grok', 'gemini', 'codex', 'sonnet', 'opus', 'gemini-3.6', 'gpt-oss']) {
      expect(resolveModel(alias)).toBeUndefined();
    }
  });

  it('resolves effort suffixes', () => {
    const grokMedium = resolveModel('xai-grok/grok-4.5-medium');
    expect(grokMedium?.spec.slug).toBe('xai-grok/grok-4.5');
    expect(grokMedium?.effort).toBe('medium');

    const sonnetMax = resolveModel('anthropic-claude/sonnet-max');
    expect(sonnetMax?.spec.slug).toBe('anthropic-claude/sonnet');
    expect(sonnetMax?.effort).toBe('max');
  });

  it('rejects unsupported efforts', () => {
    const grokXhigh = resolveModel('xai-grok/grok-4.5-xhigh');
    expect(grokXhigh).toBeUndefined();

    const gptOssHigh = resolveModel('google-antigravity/gpt-oss-120b-medium-high');
    expect(gptOssHigh).toBeUndefined();
  });

  it('handles unknown models', () => {
    expect(resolveModel('nonexistent-model')).toBeUndefined();
    const err = formatUnknownModelError('nonexistent-model');
    expect(err).toContain('Unknown model "nonexistent-model".');
  });

  it('prioritizes exact matches over effort splitting', () => {
    const gptOss = resolveModel('google-antigravity/gpt-oss-120b-medium');
    expect(gptOss).toBeDefined();
    expect(gptOss?.spec.slug).toBe('google-antigravity/gpt-oss-120b-medium');
    expect(gptOss?.effort).toBeUndefined();
  });

  it('computes backendModelId correctly for agy vs others', () => {
    const gemini = resolveModel('google-antigravity/gemini-3.6-flash');
    if (!gemini) throw new Error('gemini resolution failed');
    expect(backendModelId(gemini)).toBe('gemini-3.6-flash-high');

    const geminiLow = resolveModel('google-antigravity/gemini-3.6-flash-low');
    if (!geminiLow) throw new Error('geminiLow resolution failed');
    expect(backendModelId(geminiLow)).toBe('gemini-3.6-flash-low');

    const grok = resolveModel('xai-grok/grok-4.5');
    if (!grok) throw new Error('grok resolution failed');
    expect(backendModelId(grok)).toBe('grok-4.5');

    const sonnet = resolveModel('anthropic-claude/sonnet');
    if (!sonnet) throw new Error('sonnet resolution failed');
    expect(backendModelId(sonnet)).toBe('sonnet');
  });

  it('marks only codex and grok seats as image-gen capable', () => {
    const codex = resolveModel('openai-codex/gpt-5.6-sol');
    const grok = resolveModel('xai-grok/grok-4.5');
    const gemini = resolveModel('google-antigravity/gemini-3.6-flash');
    if (!codex || !grok || !gemini) throw new Error('resolution failed');
    expect(supportsImageGen(codex)).toBe(true);
    expect(supportsImageGen(grok)).toBe(true);
    expect(supportsImageGen(gemini)).toBe(false);
  });

  it('lists only image-capable seats when imageOnly', () => {
    const lines = listModelHelpLines({ imageOnly: true }).join('\n');
    expect(lines).toContain('xai-grok/grok-4.5');
    expect(lines).toContain('openai-codex/gpt-5.6-sol');
    expect(lines).not.toContain('google-antigravity/gemini-3.6-flash');
  });

  it('formats image-gen model errors with capable seats only', () => {
    const gemini = resolveModel('google-antigravity/gemini-3.6-flash');
    if (!gemini) throw new Error('gemini resolution failed');
    const err = formatImageGenModelError('google-antigravity/gemini-3.6-flash', gemini);
    expect(err).toContain('cannot generate images');
    expect(err).toContain('backend "agy"');
    // capable seats listed:
    expect(err).toContain('xai-grok/grok-4.5');
    expect(err).toContain('openai-codex/gpt-5.6-sol');
    // rejected seat named in the headline only — not re-listed under seats
    const seatsSection = err.slice(err.indexOf('Image-gen seats'));
    expect(seatsSection).not.toContain('google-antigravity/gemini-3.6-flash');
  });
});
