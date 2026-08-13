import { describe, expect, it, vi } from 'vitest';
import type { LocalContext } from './context.ts';

const mockPlanImpl = vi.fn();
const mockSubagentImpl = vi.fn();

vi.mock('./commands/plan/impl.ts', () => ({
  default: function (this: LocalContext, ...args: unknown[]) {
    return mockPlanImpl.call(this, ...args);
  },
}));

vi.mock('./commands/subagent/impl.ts', () => ({
  default: function (this: LocalContext, ...args: unknown[]) {
    return mockSubagentImpl.call(this, ...args);
  },
}));

// Must import app AFTER mocks
const { runCli } = await import('./app.ts');

function fakeCtx(): LocalContext {
  return {
    process: {
      stdout: { write: () => true },
      stderr: { write: () => true },
      exitCode: undefined as number | undefined,
      env: { ...process.env, NO_COLOR: '1' },
      cwd: () => process.cwd(),
    } as unknown as NodeJS.Process,
  };
}

describe('flag mapping & defaults lock', () => {
  it('plan command maps defaults correctly', async () => {
    mockPlanImpl.mockReset();
    const ctx = fakeCtx();
    await runCli(ctx, ['plan', '--model', 'xai-grok/grok-4.6', '--out', 'plan.md', 'do something']);
    expect(mockPlanImpl).toHaveBeenCalledTimes(1);
    const [call] = mockPlanImpl.mock.calls;
    expect(call).toBeDefined();
    if (!call) return;
    const [flags, prompt] = call;
    expect(prompt).toBe('do something');
    expect(flags).toEqual({
      model: 'xai-grok/grok-4.6',
      out: 'plan.md',
      preflight: true,
    });
  });

  it('plan command handles --no-preflight and --timeout', async () => {
    mockPlanImpl.mockReset();
    const ctx = fakeCtx();
    await runCli(ctx, [
      'plan',
      '--model',
      'xai-grok/grok-4.6',
      '--out',
      'plan.md',
      '--no-preflight',
      '--timeout',
      '120',
      'task',
    ]);
    expect(mockPlanImpl).toHaveBeenCalledTimes(1);
    const [call] = mockPlanImpl.mock.calls;
    expect(call).toBeDefined();
    if (!call) return;
    const [flags, prompt] = call;
    expect(prompt).toBe('task');
    expect(flags).toEqual({
      model: 'xai-grok/grok-4.6',
      out: 'plan.md',
      preflight: false,
      timeout: 120,
    });
  });

  it('subagent command maps defaults correctly', async () => {
    mockSubagentImpl.mockReset();
    const ctx = fakeCtx();
    await runCli(ctx, ['subagent', '--model', 'xai-grok/grok-4.6', 'hello agent']);
    expect(mockSubagentImpl).toHaveBeenCalledTimes(1);
    const [call] = mockSubagentImpl.mock.calls;
    expect(call).toBeDefined();
    if (!call) return;
    const [flags, prompt] = call;
    expect(prompt).toBe('hello agent');
    expect(flags).toEqual({
      model: 'xai-grok/grok-4.6',
      tools: true,
      preflight: true,
      json: false,
    });
  });

  it('subagent command handles --no-tools and --no-preflight', async () => {
    mockSubagentImpl.mockReset();
    const ctx = fakeCtx();
    await runCli(ctx, [
      'subagent',
      '--model',
      'xai-grok/grok-4.6',
      '--no-tools',
      '--no-preflight',
      'hello agent',
    ]);
    expect(mockSubagentImpl).toHaveBeenCalledTimes(1);
    const [call] = mockSubagentImpl.mock.calls;
    expect(call).toBeDefined();
    if (!call) return;
    const [flags, prompt] = call;
    expect(prompt).toBe('hello agent');
    expect(flags).toEqual({
      model: 'xai-grok/grok-4.6',
      tools: false,
      preflight: false,
      json: false,
    });
  });
});
