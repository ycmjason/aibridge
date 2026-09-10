import { describe, expect, it } from 'vitest';
import type { Availability } from './driver.ts';
import { type Installed, installedBackends, missingLines, requireBackend } from './installed.ts';
import type { Backend } from './models.ts';

const ctx = () => {
  let stderr = '';
  return {
    process: {
      stderr: {
        write: (s: string) => {
          stderr += s;
          return true;
        },
      },
      exitCode: undefined as NodeJS.Process['exitCode'],
    },
    stderr: () => stderr,
  };
};

const MISSING: Availability = {
  ok: false,
  error: 'aibridge: "grok" not found on PATH. Install it.',
};
const OK: Availability = { ok: true, version: '1' };

describe('installed', () => {
  it('installedBackends and missingLines split the probe map', () => {
    const m = new Map<Backend, Availability>([
      ['grok', MISSING],
      ['codex', OK],
    ]);
    expect([...installedBackends(m)]).toEqual(['codex']);
    expect(missingLines(m)).toEqual(['  grok: "grok" not found on PATH. Install it.']);
  });

  it('requireBackend passes an installed backend through without a full sweep', async () => {
    const c = ctx();
    let swept = false;
    const ok = await requireBackend(
      c,
      'subagent',
      'codex',
      {},
      {
        probe: async () => OK,
        detect: async () => {
          swept = true;
          return new Map();
        },
      },
    );
    expect(ok).toBe(true);
    expect(swept).toBe(false);
    expect(c.stderr()).toBe('');
    expect(c.process.exitCode).toBeUndefined();
  });

  it('requireBackend exits 2 with the installed model list when the backend is missing', async () => {
    const c = ctx();
    const ok = await requireBackend(
      c,
      'subagent',
      'grok',
      {},
      {
        probe: async () => MISSING,
        detect: async () =>
          new Map<Backend, Availability>([
            ['grok', MISSING],
            ['codex', OK],
          ]),
      },
    );
    expect(ok).toBe(false);
    expect(c.process.exitCode).toBe(2);
    expect(c.stderr()).toContain('aibridge subagent: "grok" not found on PATH. Install it.');
    expect(c.stderr()).toContain('Installed backends: codex.');
    expect(c.stderr()).toContain('openai-codex/gpt-5.6-sol');
    expect(c.stderr()).not.toContain('xai-grok');
  });

  it('requireBackend lists install hints when nothing is installed', async () => {
    const c = ctx();
    await requireBackend(
      c,
      'plan',
      'grok',
      {},
      {
        probe: async () => MISSING,
        detect: async (): Promise<Installed> => new Map<Backend, Availability>([['grok', MISSING]]),
      },
    );
    expect(c.process.exitCode).toBe(2);
    expect(c.stderr()).toContain('No backend CLIs found on PATH. Install one of:');
  });
});
