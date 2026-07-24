import { describe, expect, it } from 'vitest';
import { runCli } from './app.ts';
import type { LocalContext } from './context.ts';

function fakeCtx(): LocalContext & { _stdout: string[]; _stderr: string[] } {
  const _stdout: string[] = [];
  const _stderr: string[] = [];
  const processLike = {
    stdout: {
      write: (s: string) => {
        _stdout.push(s);
        return true;
      },
    },
    stderr: {
      write: (s: string) => {
        _stderr.push(s);
        return true;
      },
    },
    exitCode: undefined as number | undefined,
    env: { ...process.env, NO_COLOR: '1', STRICLI_NO_COLOR: '1' },
    cwd: () => process.cwd(),
  };
  return { process: processLike as unknown as NodeJS.Process, _stdout, _stderr };
}

describe('stricli exit-code lock & routing', () => {
  it('unknown command → 2', async () => {
    const ctx = fakeCtx();
    await runCli(ctx, ['nonsense']);
    expect(ctx.process.exitCode).toBe(2);
  });

  it('unknown flag → 2', async () => {
    const ctx = fakeCtx();
    await runCli(ctx, ['plan', '--not-a-flag', 'x']);
    expect(ctx.process.exitCode).toBe(2);
  });

  it('missing required arg → 2', async () => {
    const ctx = fakeCtx();
    await runCli(ctx, ['plan']);
    expect(ctx.process.exitCode).toBe(2);
  });

  it('empty prompt → 2', async () => {
    const ctx = fakeCtx();
    await runCli(ctx, ['plan', '']);
    expect(ctx.process.exitCode).toBe(2);
  });

  it('review with stray positional → 2', async () => {
    const ctx = fakeCtx();
    await runCli(ctx, ['review', 'stray']);
    expect(ctx.process.exitCode).toBe(2);
  });

  it('runs --watch with idPrefix → 2', async () => {
    const ctx = fakeCtx();
    await runCli(ctx, ['runs', '--watch', 'someid']);
    expect(ctx.process.exitCode).toBe(2);
  });

  it('runs --watch with --json → 2', async () => {
    const ctx = fakeCtx();
    await runCli(ctx, ['runs', '--watch', '--json']);
    expect(ctx.process.exitCode).toBe(2);
  });

  it('runs --no-json → 2', async () => {
    const ctx = fakeCtx();
    await runCli(ctx, ['runs', '--no-json']);
    expect(ctx.process.exitCode).toBe(2);
  });

  it('runs --no-watch → 2', async () => {
    const ctx = fakeCtx();
    await runCli(ctx, ['runs', '--no-watch']);
    expect(ctx.process.exitCode).toBe(2);
  });

  it('root --help lists all commands', async () => {
    const ctx = fakeCtx();
    await runCli(ctx, ['--help']);
    const output = ctx._stdout.join('');
    for (const cmd of ['plan', 'implement', 'review', 'subagent', 'image-gen', 'runs', 'quota']) {
      expect(output).toContain(cmd);
    }
  });
});
