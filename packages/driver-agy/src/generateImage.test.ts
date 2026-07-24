import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunResult } from '@aibridge/proc';
import { describe, expect, it } from 'vitest';
import { generateImage, type ImageGenRequest } from './generateImage.ts';

describe('generateImage', () => {
  const baseReq: ImageGenRequest = {
    prompt: 'A futuristic city skyline',
    workDir: '/tmp/work',
    backendModel: 'gemini-3.6-flash-high',
    size: undefined,
    imagePaths: [],
    timeoutSec: 600,
    forceful: false,
    minBytes: 10_000,
  };

  it('assembles correct prompt and argv shape for standard generation', async () => {
    let capturedCmd = '';
    let capturedArgs: readonly string[] = [];

    const fakeExec = async (cmd: string, args: readonly string[]): Promise<RunResult> => {
      if (args.includes('--version')) {
        return {
          code: 0,
          signal: null,
          stdout: 'agy version 1.0.0\n',
          stderr: '',
          timedOut: false,
        };
      }
      capturedCmd = cmd;
      capturedArgs = args;
      return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false };
    };

    const req: ImageGenRequest = {
      ...baseReq,
      size: { w: 1920, h: 1080 },
    };

    await generateImage(req, fakeExec);

    expect(capturedCmd).toBe('agy');
    expect(capturedArgs).toContain('--model');
    expect(capturedArgs).toContain('gemini-3.6-flash-high');
    expect(capturedArgs).toContain('--dangerously-skip-permissions');

    const promptIdx = capturedArgs.indexOf('-p');
    expect(promptIdx).toBeGreaterThan(-1);
    const promptArg = capturedArgs[promptIdx + 1] ?? '';

    expect(promptArg).toContain('generate_image');
    expect(promptArg).toContain('16:9');
    expect(promptArg).toContain('print ONLY the absolute filesystem path');
  });

  it('includes ImagePaths in prompt when reference images are provided', async () => {
    let capturedPrompt = '';

    const fakeExec = async (_cmd: string, args: readonly string[]): Promise<RunResult> => {
      if (args.includes('--version')) {
        return {
          code: 0,
          signal: null,
          stdout: 'agy version 1.0.0\n',
          stderr: '',
          timedOut: false,
        };
      }
      const promptIdx = args.indexOf('-p');
      capturedPrompt = args[promptIdx + 1] ?? '';
      return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false };
    };

    const req: ImageGenRequest = {
      ...baseReq,
      imagePaths: ['/tmp/a.png'],
    };

    await generateImage(req, fakeExec);

    expect(capturedPrompt).toContain('ImagePaths');
    expect(capturedPrompt).toContain('/tmp/a.png');
  });

  it('returns ok when stdout path is printed and exists with sufficient bytes', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'agy-img-test-'));
    const imgPath = join(tmpDir, 'output.png');
    const content = Buffer.alloc(12_000);
    writeFileSync(imgPath, content);

    try {
      const fakeExec = async (_cmd: string, args: readonly string[]): Promise<RunResult> => {
        if (args.includes('--version')) {
          return {
            code: 0,
            signal: null,
            stdout: 'agy version 1.0.0\n',
            stderr: '',
            timedOut: false,
          };
        }
        return { code: 0, signal: null, stdout: `${imgPath}\n`, stderr: '', timedOut: false };
      };

      const res = await generateImage(baseReq, fakeExec);
      expect(res).toEqual({
        kind: 'ok',
        path: imgPath,
        bytes: 12_000,
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns error when command times out', async () => {
    const fakeExec = async (_cmd: string, args: readonly string[]): Promise<RunResult> => {
      if (args.includes('--version')) {
        return {
          code: 0,
          signal: null,
          stdout: 'agy version 1.0.0\n',
          stderr: '',
          timedOut: false,
        };
      }
      return { code: null, signal: 'SIGTERM', stdout: '', stderr: '', timedOut: true };
    };

    const res = await generateImage(baseReq, fakeExec);
    expect(res.kind).toBe('error');
    if (res.kind === 'error') {
      expect(res.reason).toContain('--timeout');
    }
  });

  it('returns suspect when no output is produced and exit code is 0', async () => {
    const fakeExec = async (_cmd: string, args: readonly string[]): Promise<RunResult> => {
      if (args.includes('--version')) {
        return {
          code: 0,
          signal: null,
          stdout: 'agy version 1.0.0\n',
          stderr: '',
          timedOut: false,
        };
      }
      return { code: 0, signal: null, stdout: 'Done tool call', stderr: '', timedOut: false };
    };

    const res = await generateImage(baseReq, fakeExec);
    expect(res).toEqual({ kind: 'suspect' });
  });
});
