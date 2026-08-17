import { describe, expect, it } from 'vitest';
import type { LocalContext } from '../../context.ts';
import imageGen, { type ImageGenFlags } from './impl.ts';

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
  transparent: false,
  ...over,
});

describe('image-gen validation', () => {
  it('refuses --transparent with a .jpg --out', async () => {
    const { ctx: c, stderr } = ctx();
    await imageGen.call(c, flags({ transparent: true }), 'a fox');
    expect(stderr()).toContain('must end in .png');
    expect(stderr()).toContain('--transparent always writes PNG');
    expect(c.process.exitCode).toBe(1);
  });

  it('refuses a transparent-background prompt on a chroma seat without the flag', async () => {
    const { ctx: c, stderr } = ctx();
    await imageGen.call(c, flags({}), 'a fox on a transparent background');
    expect(stderr()).toContain('cannot render alpha');
    expect(stderr()).toContain('--transparent');
    expect(c.process.exitCode).toBe(1);
  });

  it('does not refuse a see-through subject', async () => {
    const { ctx: c, stderr } = ctx();
    // A transparent *subject* is a normal brief; only the background phrasing is
    // a capability mismatch. This one must fall through to the .jpg/.png check.
    await imageGen.call(c, flags({ out: '/tmp/out.png' }), 'a transparent glass bottle');
    expect(stderr()).not.toContain('cannot render alpha');
    expect(stderr()).toContain('must end in .jpg or .jpeg');
  });
});
