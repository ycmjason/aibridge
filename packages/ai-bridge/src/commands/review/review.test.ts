import { describe, expect, it } from 'vitest';
import { parseReviewVerdict } from './impl.ts';

describe('parseReviewVerdict', () => {
  it('parses PASS verdict', () => {
    const res = parseReviewVerdict('PASS\nFull report below...');
    expect(res.kind).toBe('pass');
  });

  it('parses FINDINGS verdict line', () => {
    const res = parseReviewVerdict('FINDINGS: 0 critical, 1 major, 2 minor');
    expect(res).toEqual({
      kind: 'findings',
      critical: 0,
      major: 1,
      minor: 2,
      formattedLine: 'FINDINGS: 0 critical, 1 major, 2 minor',
    });
  });

  it('parses FINDINGS verdict line with minor only', () => {
    const res = parseReviewVerdict('FINDINGS: 3 minor');
    expect(res).toEqual({
      kind: 'findings',
      critical: 0,
      major: 0,
      minor: 3,
      formattedLine: 'FINDINGS: 0 critical, 0 major, 3 minor',
    });
  });

  it('handles unparseable text', () => {
    const res = parseReviewVerdict('The code looks mostly fine but has issues.');
    expect(res.kind).toBe('unparseable');
  });

  it('parses a verdict on the last line after narration', () => {
    const res = parseReviewVerdict('Reading the diff now.\nWriting the report.\nPASS');
    expect(res.kind).toBe('pass');
  });

  it('parses a verdict embedded in a newline-free narration blob (observed grok behavior)', () => {
    const res = parseReviewVerdict(
      'Inspecting the diff and plan contract.Checking contract edges, then writing the report.FINDINGS: 0 critical, 5 major, 4 minor',
    );
    expect(res).toEqual({
      kind: 'findings',
      critical: 0,
      major: 5,
      minor: 4,
      formattedLine: 'FINDINGS: 0 critical, 5 major, 4 minor',
    });
  });
});
