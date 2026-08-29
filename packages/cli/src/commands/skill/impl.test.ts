import { describe, expect, it } from 'vitest';
import type { LocalContext } from '../../context.ts';
import { PACKAGE_VERSION } from '../../package.ts';
import skillImpl from './impl.ts';

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

describe('skill command', () => {
  it('prints the router with an exact-version runner', () => {
    const ctx = fakeCtx();
    skillImpl.call(ctx);
    const output = ctx.stdout.join('');

    expect(output).toContain(`npx -y @aibridge/cli@${PACKAGE_VERSION}`);
    expect(output).toContain('# aibridge');
    expect(output).not.toContain('# plan —');
    expect(ctx.process.exitCode).toBeUndefined();
  });

  it('appends command-specific instructions', () => {
    const ctx = fakeCtx();
    skillImpl.call(ctx, 'plan');
    const output = ctx.stdout.join('');

    expect(output).toContain('# aibridge');
    expect(output).toContain('# plan — write a detailed implementation plan file');
  });

  it('rejects an unknown topic', () => {
    const ctx = fakeCtx();
    skillImpl.call(ctx, 'nope');

    expect(ctx.process.exitCode).toBe(2);
    expect(ctx.stderr.join('')).toContain('unknown topic "nope"');
    expect(ctx.stdout).toEqual([]);
  });
});
