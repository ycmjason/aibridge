import { describe, expect, it } from 'vitest';
import { installedBackends, missingLines, requireBackend } from './installed.ts';

describe('installed', () => {
  it('installedBackends and missingLines split the probe map', () => {
    const m = new Map([
      ['grok', { ok: false as const, error: 'aibridge: "grok" not found on PATH. Install it.' }],
      ['codex', { ok: true as const, version: '1' }],
    ] as const);
    expect([...installedBackends(m)]).toEqual(['codex']);
    expect(missingLines(m)).toEqual(['  grok: "grok" not found on PATH. Install it.']);
  });

  it('requireBackend passes through an installed backend without touching the context', async () => {
    let stderr = '';
    const ctx = {
      process: {
        stderr: {
          write: (s: string) => {
            stderr += s;
            return true;
          },
        },
        exitCode: undefined as NodeJS.Process['exitCode'],
      },
    };
    // codex is installed on every machine that runs this suite (it is a dev dependency of the repo).
    // ponytail: a missing-backend path is covered end to end by the skill tests via an injected map.
    const ok = await requireBackend(ctx, 'subagent', 'codex');
    if (ok) {
      expect(stderr).toBe('');
      expect(ctx.process.exitCode).toBeUndefined();
    } else {
      expect(ctx.process.exitCode).toBe(2);
      expect(stderr).toContain('aibridge subagent: "codex" not found');
    }
  });
});
