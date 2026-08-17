import { describe, expect, it } from 'vitest';
import { buildCodexExecArgs } from './codex.ts';

describe('buildCodexExecArgs', () => {
  it('handles workspace-write approval mode', () => {
    const args = buildCodexExecArgs('do something', {
      cwd: '/repo',
      approval: 'workspace-write',
      model: 'gpt-5.6-sol',
      timeoutMs: 1000,
    });
    expect(args).toEqual([
      'exec',
      '-s',
      'workspace-write',
      '--skip-git-repo-check',
      '-C',
      '/repo',
      '-m',
      'gpt-5.6-sol',
      'do something',
    ]);
  });

  it('handles bypass approval mode', () => {
    const args = buildCodexExecArgs('do something', {
      cwd: '/repo',
      approval: 'bypass',
      model: 'gpt-5.6-sol',
      timeoutMs: 1000,
    });
    expect(args).toEqual([
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '-C',
      '/repo',
      '-m',
      'gpt-5.6-sol',
      'do something',
    ]);
  });

  it('handles read-only approval mode', () => {
    const args = buildCodexExecArgs('do something', {
      cwd: '/repo',
      approval: 'read-only',
      model: 'gpt-5.6-sol',
      timeoutMs: 1000,
    });
    expect(args).toEqual([
      'exec',
      '-s',
      'read-only',
      '--skip-git-repo-check',
      '-C',
      '/repo',
      '-m',
      'gpt-5.6-sol',
      'do something',
    ]);
  });

  it('includes model and config options', () => {
    const args = buildCodexExecArgs('do something', {
      cwd: '/repo',
      approval: 'bypass',
      model: 'gpt-5.6-sol',
      config: ['model_reasoning_effort=high'],
      outputLastMessage: '/tmp/last.txt',
      timeoutMs: 1000,
    });
    expect(args).toEqual([
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '-C',
      '/repo',
      '-m',
      'gpt-5.6-sol',
      '-c',
      'model_reasoning_effort=high',
      '--output-last-message',
      '/tmp/last.txt',
      'do something',
    ]);
  });
});
