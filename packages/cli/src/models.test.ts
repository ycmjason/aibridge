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
    const grok = resolveModel('xai-grok/grok-4.6');
    expect(grok).toBeDefined();
    expect(grok?.spec.slug).toBe('xai-grok/grok-4.6');
    expect(grok?.effort).toBeUndefined();

    const gemini = resolveModel('google-antigravity/gemini-3.7-flash');
    expect(gemini).toBeDefined();
    expect(gemini?.spec.slug).toBe('google-antigravity/gemini-3.7-flash');
    expect(gemini?.effort).toBe('high');
  });

  it('rejects short aliases — canonical slugs only', () => {
    for (const alias of [
      'grok',
      'gemini',
      'codex',
      'sonnet',
      'opus',
      'gemini-3.6',
      'gpt-oss',
      'anthropic-claude/sonnet',
      'anthropic-claude/opus',
    ]) {
      expect(resolveModel(alias)).toBeUndefined();
    }
  });

  it('resolves effort suffixes', () => {
    const grokMedium = resolveModel('xai-grok/grok-4.6-medium');
    expect(grokMedium?.spec.slug).toBe('xai-grok/grok-4.6');
    expect(grokMedium?.effort).toBe('medium');

    const sonnetMax = resolveModel('anthropic-claude/sonnet-5-max');
    expect(sonnetMax?.spec.slug).toBe('anthropic-claude/sonnet-5');
    expect(sonnetMax?.effort).toBe('max');
  });

  it('rejects unsupported efforts', () => {
    const grokXhigh = resolveModel('xai-grok/grok-4.6-xhigh');
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
    const gemini = resolveModel('google-antigravity/gemini-3.7-flash');
    if (!gemini) throw new Error('gemini resolution failed');
    expect(backendModelId(gemini)).toBe('gemini-3.7-flash-high');

    const geminiLow = resolveModel('google-antigravity/gemini-3.7-flash-low');
    if (!geminiLow) throw new Error('geminiLow resolution failed');
    expect(backendModelId(geminiLow)).toBe('gemini-3.7-flash-low');

    const grok = resolveModel('xai-grok/grok-4.6');
    if (!grok) throw new Error('grok resolution failed');
    expect(backendModelId(grok)).toBe('grok-4.6');

    const sonnet = resolveModel('anthropic-claude/sonnet-5');
    if (!sonnet) throw new Error('sonnet resolution failed');
    expect(backendModelId(sonnet)).toBe('claude-sonnet-5');
  });

  it('marks codex, grok, and gemini-3.7-flash seats as image-gen capable', () => {
    const codex = resolveModel('openai-codex/gpt-5.6-sol');
    const grok = resolveModel('xai-grok/grok-4.6');
    const gemini = resolveModel('google-antigravity/gemini-3.7-flash');
    const claudeSonnet = resolveModel('anthropic-claude/sonnet-5');
    if (!codex || !grok || !gemini || !claudeSonnet) throw new Error('resolution failed');
    expect(supportsImageGen(codex)).toBe(true);
    expect(supportsImageGen(grok)).toBe(true);
    expect(supportsImageGen(gemini)).toBe(true);
    expect(supportsImageGen(claudeSonnet)).toBe(false);
  });

  it('lists only image-capable seats when imageOnly', () => {
    const lines = listModelHelpLines({ imageOnly: true }).join('\n');
    expect(lines).toContain('xai-grok/grok-4.6');
    expect(lines).toContain('openai-codex/gpt-5.6-sol');
    expect(lines).toContain('google-antigravity/gemini-3.7-flash');
    expect(lines).not.toContain('anthropic-claude/sonnet-5');
  });

  it('formats image-gen model errors with capable seats only', () => {
    const claudeSonnet = resolveModel('anthropic-claude/sonnet-5');
    if (!claudeSonnet) throw new Error('claudeSonnet resolution failed');
    const err = formatImageGenModelError('anthropic-claude/sonnet-5', claudeSonnet);
    expect(err).toContain('cannot generate images');
    expect(err).toContain('backend "claude"');
    expect(err).toContain('xai-grok/grok-4.6');
    expect(err).toContain('openai-codex/gpt-5.6-sol');
    expect(err).toContain('google-antigravity/gemini-3.7-flash');
    const seatsSection = err.slice(err.indexOf('Image-gen seats'));
    expect(seatsSection).not.toContain('anthropic-claude/sonnet-5');
  });
});
