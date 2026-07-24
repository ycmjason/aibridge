import { ExitCode } from '@stricli/core';
import { describe, expect, it } from 'vitest';
import type { LocalContext } from './context.ts';
import { normalizeExitCode } from './exitCode.ts';

function createMockCtx(exitCode?: number): LocalContext {
  return {
    process: {
      exitCode,
    } as unknown as NodeJS.Process,
  };
}

describe('normalizeExitCode', () => {
  it('leaves undefined exitCode untouched', () => {
    const ctx = createMockCtx(undefined);
    normalizeExitCode(ctx);
    expect(ctx.process.exitCode).toBeUndefined();
  });

  it.each([0, 1, 2, 3])('preserves valid contract exit code %i', code => {
    const ctx = createMockCtx(code);
    normalizeExitCode(ctx);
    expect(ctx.process.exitCode).toBe(code);
  });

  it('maps ExitCode.InvalidArgument (-4) to 2', () => {
    const ctx = createMockCtx(ExitCode.InvalidArgument);
    normalizeExitCode(ctx);
    expect(ctx.process.exitCode).toBe(2);
  });

  it('maps ExitCode.UnknownCommand (-5) to 2', () => {
    const ctx = createMockCtx(ExitCode.UnknownCommand);
    normalizeExitCode(ctx);
    expect(ctx.process.exitCode).toBe(2);
  });

  it.each([-1, -2, -3, -6, -99, 4, 127])('maps other non-contract code %i to 1', code => {
    const ctx = createMockCtx(code);
    normalizeExitCode(ctx);
    expect(ctx.process.exitCode).toBe(1);
  });
});
