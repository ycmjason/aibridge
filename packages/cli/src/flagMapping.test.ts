import { describe, expect, it, vi } from 'vitest';
import type { LocalContext } from './context.ts';

const mockSubagentImpl = vi.fn();

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

  it('subagent command handles --no-tools, --no-preflight and --timeout', async () => {
    mockSubagentImpl.mockReset();
    const ctx = fakeCtx();
    await runCli(ctx, [
      'subagent',
      '--model',
      'xai-grok/grok-4.6',
      '--no-tools',
      '--no-preflight',
      '--timeout',
      '120',
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
      timeout: 120,
    });
  });
});
