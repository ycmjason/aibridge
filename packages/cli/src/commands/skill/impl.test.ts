import { describe, expect, it } from 'vitest';
import type { LocalContext } from '../../context.ts';
import type { Installed } from '../../installed.ts';
import { PACKAGE_VERSION } from '../../package.ts';
import skillImpl, { applyTemplate, renderSkill } from './impl.ts';

function fakeCtx(): LocalContext & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    process: {
      stdout: {
        write: (value: string) => {
          stdout.push(value);
          return true;
        },
      },
      stderr: {
        write: (value: string) => {
          stderr.push(value);
          return true;
        },
      },
      exitCode: undefined,
    } as unknown as NodeJS.Process,
    stdout,
    stderr,
  };
}

const ALL: Installed = new Map([
  ['grok', { ok: true, version: 'grok 1.0' }],
  ['agy', { ok: true, version: '1.1' }],
  ['codex', { ok: true, version: 'codex-cli 0.1' }],
  ['claude', { ok: true, version: '2.1' }],
]);

const CODEX_AGY: Installed = new Map([
  ['grok', { ok: false, error: 'aibridge: "grok" not found on PATH. Install the Grok CLI.' }],
  ['agy', { ok: true, version: '1.1' }],
  ['codex', { ok: true, version: 'codex-cli 0.1' }],
  ['claude', { ok: false, error: 'aibridge: "claude" not found on PATH. Install Claude Code.' }],
]);

const NONE: Installed = new Map([
  ['grok', { ok: false, error: 'aibridge: "grok" not found on PATH.' }],
  ['agy', { ok: false, error: 'aibridge: "agy" not found on PATH.' }],
  ['codex', { ok: false, error: 'aibridge: "codex" not found on PATH.' }],
  ['claude', { ok: false, error: 'aibridge: "claude" not found on PATH.' }],
]);

describe('skill command', () => {
  it('prints the router with an exact-version runner', async () => {
    const ctx = fakeCtx();
    await skillImpl.call(ctx, undefined, ALL);
    const output = ctx.stdout.join('');

    expect(output).toContain(`npx -y @aibridge/cli@${PACKAGE_VERSION}`);
    expect(output).toContain('# aibridge');
    expect(output).toContain('| `xai-grok/grok-4.6` |');
    expect(output).not.toContain('# plan —');
    expect(output).not.toMatch(/\{\{|<!-- (if|endif)/);
    expect(ctx.process.exitCode).toBeUndefined();
  });

  it('appends command-specific instructions', async () => {
    const ctx = fakeCtx();
    await skillImpl.call(ctx, 'plan', ALL);
    const output = ctx.stdout.join('');

    expect(output).toContain('# aibridge');
    expect(output).toContain('# plan — write a detailed implementation plan file');
    expect(output).toContain('e.g. xai-grok/grok-4.6');
  });

  it('omits absent backends from every instruction topic', () => {
    for (const topic of ['plan', 'implement', 'review', 'subagent', 'image-gen'] as const) {
      const output = renderSkill(topic, CODEX_AGY);
      expect(output, topic).not.toContain('xai-grok');
      expect(output, topic).not.toContain('anthropic-claude/');
      expect(output, topic).not.toMatch(/\{\{|<!-- (if|endif)/);
    }
    const plan = renderSkill('plan', CODEX_AGY);
    expect(plan).toContain('Not installed (their seats are omitted below):');
    expect(plan).toContain('grok: "grok" not found on PATH. Install the Grok CLI.');
    expect(plan).toContain('e.g. openai-codex/gpt-5.6-sol');
    expect(plan).toContain('implement --model google-antigravity/gemini-3.7-flash <file>');
    expect(plan).not.toContain('One grok stage at a time');
  });

  it('applyTemplate keeps a block when any listed backend is installed', () => {
    const text =
      'a\n<!-- if:grok,codex -->\nkeep\n<!-- endif -->\n<!-- if:grok -->\ndrop\n<!-- endif -->\nb';
    expect(applyTemplate(text, CODEX_AGY)).toBe('a\nkeep\nb');
  });

  it('refuses to render instructions when no backend is installed', async () => {
    const ctx = fakeCtx();
    await skillImpl.call(ctx, undefined, NONE);

    expect(ctx.process.exitCode).toBe(1);
    expect(ctx.stdout).toEqual([]);
    expect(ctx.stderr.join('')).toContain('no backend CLI found on PATH');
    expect(ctx.stderr.join('')).toContain('codex: "codex" not found on PATH.');
  });

  it('rejects an unknown topic', async () => {
    const ctx = fakeCtx();
    await skillImpl.call(ctx, 'nope', ALL);

    expect(ctx.process.exitCode).toBe(2);
    expect(ctx.stderr.join('')).toContain('unknown topic "nope"');
    expect(ctx.stdout).toEqual([]);
  });
});
