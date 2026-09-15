import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { runCaptured } from './proc.ts';

describe('runCaptured stdout retention', () => {
  it('retains stdout by default and forwards to onStdout', async () => {
    const chunks: string[] = [];
    const res = await runCaptured(process.execPath, ['-e', "process.stdout.write('hello')"], {
      onStdout: chunk => chunks.push(chunk),
    });
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('hello');
    expect(chunks.join('')).toBe('hello');
  });

  it('drops stdout retention when captureStdout is false but still calls onStdout', async () => {
    const chunks: string[] = [];
    const res = await runCaptured(process.execPath, ['-e', "process.stdout.write('hello')"], {
      captureStdout: false,
      onStdout: chunk => chunks.push(chunk),
    });
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('');
    expect(chunks.join('')).toBe('hello');
  });

  it('captures stderr when captureStdout is false and fires both callbacks', async () => {
    const outChunks: string[] = [];
    const errChunks: string[] = [];
    const res = await runCaptured(
      process.execPath,
      ['-e', "process.stdout.write('hello'); process.stderr.write('world');"],
      {
        captureStdout: false,
        onStdout: chunk => outChunks.push(chunk),
        onStderr: chunk => errChunks.push(chunk),
      },
    );
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('');
    expect(res.stderr).toBe('world');
    expect(outChunks.join('')).toBe('hello');
    expect(errChunks.join('')).toBe('world');
  });

  it('retains stdout when captureStdout is explicitly true', async () => {
    const chunks: string[] = [];
    const res = await runCaptured(process.execPath, ['-e', "process.stdout.write('hello')"], {
      captureStdout: true,
      onStdout: chunk => chunks.push(chunk),
    });
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('hello');
    expect(chunks.join('')).toBe('hello');
  });
});
