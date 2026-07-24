import { describe, expect, it } from 'vitest';
import { delegate } from './delegate.ts';
import type { AgentCliDriver, DelegationResult, DelegationTask } from './driver.ts';
import { resolveModel } from './models.ts';
import type { RunLog } from './runlog.ts';

const PREAMBLE_PIN =
  'You are the sole executing agent for this task: do it yourself with your tools, now. ' +
  'Never defer to, wait for, or claim to hand off to another agent or process — no one ' +
  'else will act, and work not done in this run does not happen.\n\n';

class StubDriver implements AgentCliDriver {
  lastTask?: DelegationTask;
  private readonly result: DelegationResult;
  private readonly callbacks?: { stdout?: string; stderr?: string; pid?: number };

  constructor(
    result: DelegationResult,
    callbacks?: { stdout?: string; stderr?: string; pid?: number },
  ) {
    this.result = result;
    this.callbacks = callbacks;
  }

  async probe() {
    return { ok: true, version: '1.0' } as const;
  }

  async run(task: DelegationTask): Promise<DelegationResult> {
    this.lastTask = task;
    if (this.callbacks) {
      if (this.callbacks.pid !== undefined) task.onSpawn?.(this.callbacks.pid);
      if (this.callbacks.stdout !== undefined) task.onStdout?.(this.callbacks.stdout);
      if (this.callbacks.stderr !== undefined) task.onStderr?.(this.callbacks.stderr);
    }
    return this.result;
  }
}

function createRecordingRunLog() {
  const calls = {
    pid: null as number | null,
    stdout: [] as string[],
    stderr: [] as string[],
    finish: null as { status: string; exitCode: number | null } | null,
  };
  const runLog: RunLog = {
    id: 'test-id',
    dir: '/test/dir',
    setPid(pid) {
      calls.pid = pid;
    },
    stdout(chunk) {
      calls.stdout.push(chunk);
    },
    stderr(chunk) {
      calls.stderr.push(chunk);
    },
    finish(status, exitCode) {
      calls.finish = { status, exitCode };
    },
  };
  return { runLog, calls };
}

describe('delegate stub-driver tests', () => {
  const model = resolveModel('xai-grok/grok-4.5');
  if (!model) throw new Error('model resolution failed');

  it('prepends preamble when tools: true, passes untouched when tools: false', async () => {
    const stubTrue = new StubDriver({ ok: true, response: 'ok', exitCode: 0 });
    const { runLog: runLogTrue } = createRecordingRunLog();
    await delegate(
      {
        model,
        prompt: 'do work',
        tools: true,
        timeoutSec: 60,
        cwd: '/test',
        run: runLogTrue,
      },
      stubTrue,
    );
    expect(stubTrue.lastTask?.prompt).toBe(`${PREAMBLE_PIN}do work`);

    const stubFalse = new StubDriver({ ok: true, response: 'ok', exitCode: 0 });
    const { runLog: runLogFalse } = createRecordingRunLog();
    await delegate(
      {
        model,
        prompt: 'do work',
        tools: false,
        timeoutSec: 60,
        cwd: '/test',
        run: runLogFalse,
      },
      stubFalse,
    );
    expect(stubFalse.lastTask?.prompt).toBe('do work');
  });

  it('forwards stdout/stderr/spawn callbacks to RunLog', async () => {
    const stub = new StubDriver(
      { ok: true, response: 'ok', exitCode: 0 },
      { pid: 999, stdout: 'out chunk', stderr: 'err chunk' },
    );
    const { runLog, calls } = createRecordingRunLog();

    await delegate(
      {
        model,
        prompt: 'test callbacks',
        tools: true,
        timeoutSec: 60,
        cwd: '/test',
        run: runLog,
      },
      stub,
    );

    expect(calls.pid).toBe(999);
    expect(calls.stdout).toEqual(['out chunk']);
    expect(calls.stderr).toEqual(['err chunk']);
  });

  it('maps finish status and exitCode correctly for all outcome kinds', async () => {
    const outcomes: Array<{
      result: DelegationResult;
      expectedStatus: string;
      expectedExitCode: number | null;
    }> = [
      {
        result: { ok: true, response: 'all good', exitCode: 0 },
        expectedStatus: 'done',
        expectedExitCode: 0,
      },
      {
        result: { ok: false, kind: 'timeout', message: 'Timed out', exitCode: null },
        expectedStatus: 'timeout',
        expectedExitCode: null,
      },
      {
        result: { ok: false, kind: 'no-answer', message: 'Nonzero exit', exitCode: 1 },
        expectedStatus: 'error',
        expectedExitCode: 1,
      },
      {
        result: { ok: false, kind: 'not-found', message: 'CLI not found', exitCode: null },
        expectedStatus: 'error',
        expectedExitCode: null,
      },
      {
        result: { ok: false, kind: 'spawn', message: 'Spawn error', exitCode: null },
        expectedStatus: 'error',
        expectedExitCode: null,
      },
    ];

    for (const { result, expectedStatus, expectedExitCode } of outcomes) {
      const stub = new StubDriver(result);
      const { runLog, calls } = createRecordingRunLog();
      await delegate(
        {
          model,
          prompt: 'test finish mapping',
          tools: true,
          timeoutSec: 60,
          cwd: '/test',
          run: runLog,
        },
        stub,
      );

      expect(calls.finish).toEqual({
        status: expectedStatus,
        exitCode: expectedExitCode,
      });
    }
  });
});
