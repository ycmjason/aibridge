import { describe, expect, it } from 'vitest';
import type { LocalContext } from '../../context.ts';
import imageGen, { type ImageGenFlags, mentionsTransparentBackground } from './impl.ts';

/**
 * Both refusals below must land before any backend spawns — that is the whole
 * point of them, so these tests deliberately use a context with no driver stub:
 * if validation ever moves after `getDriver`, they fail by trying to run a real CLI.
 */
const ctx = (): { ctx: LocalContext; stderr: () => string } => {
  let stderr = '';
  const fake = {
    process: {
      stderr: {
        write: (s: string) => {
          stderr += s;
          return true;
        },
      },
      stdout: { write: () => true },
      cwd: () => '/tmp',
      exitCode: 0,
    },
  };
  return { ctx: fake as unknown as LocalContext, stderr: () => stderr };
};

const flags = (over: Partial<ImageGenFlags>): ImageGenFlags => ({
  model: 'xai-grok/grok-4.6',
  out: '/tmp/out.jpg',
  json: false,
  preflight: false,
  ...over,
});

describe('image-gen validation', () => {
  it('refuses a .png --out on a JPEG model', async () => {
    const { ctx: c, stderr } = ctx();
    await imageGen.call(c, flags({ out: '/tmp/out.png' }), 'a fox');
    expect(stderr()).toContain('must end in .jpg or .jpeg');
    expect(c.process.exitCode).toBe(1);
  });

  it('refuses a transparent-background prompt on a JPEG model and points at image-cutout', async () => {
    const { ctx: c, stderr } = ctx();
    await imageGen.call(c, flags({}), 'a fox on a transparent background');
    expect(stderr()).toContain('no alpha');
    expect(stderr()).toContain('aibridge image-cutout');
    expect(c.process.exitCode).toBe(1);
  });

  it('refuses a transparent-background prompt with a reference on codex', async () => {
    const { ctx: c, stderr } = ctx();
    await imageGen.call(
      c,
      flags({ model: 'openai-codex/gpt-5.6-sol', out: '/tmp/out.png', image: '/tmp/ref.png' }),
      'the same fox, no background',
    );
    expect(stderr()).toContain('fake checkerboard');
    expect(stderr()).toContain('aibridge image-cutout');
    expect(c.process.exitCode).toBe(1);
  });

  it('does not refuse a see-through subject', async () => {
    const { ctx: c, stderr } = ctx();
    // A transparent *subject* is a normal brief; only the background phrasing is
    // a capability mismatch. This one must fall through to the .jpg/.png check.
    await imageGen.call(c, flags({ out: '/tmp/out.png' }), 'a transparent glass bottle');
    expect(stderr()).not.toContain('no alpha');
    expect(stderr()).toContain('must end in .jpg or .jpeg');
  });
});

describe('mentionsTransparentBackground', () => {
  it('matches background phrasing only', () => {
    for (const p of [
      'a fox on a transparent background',
      'a fox with no background',
      'PNG with an alpha channel',
      'chroma key green screen',
    ]) {
      expect(mentionsTransparentBackground(p)).toBe(true);
    }
    for (const p of [
      'a transparent glass bottle',
      'a goldfish in a transparent bowl',
      'transparency and trust, abstract illustration',
    ]) {
      expect(mentionsTransparentBackground(p)).toBe(false);
    }
  });
});
