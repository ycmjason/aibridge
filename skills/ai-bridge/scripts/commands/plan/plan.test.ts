import { describe, expect, it } from 'vitest';
import { countOpenQuestions } from './impl.ts';

describe('countOpenQuestions', () => {
  it('returns 0 for None. section', () => {
    const md = `# Title\n\n## Open questions\n\nNone.\n`;
    expect(countOpenQuestions(md)).toBe(0);
  });

  it('returns 0 for empty section', () => {
    const md = `# Title\n\n## Open questions\n\n`;
    expect(countOpenQuestions(md)).toBe(0);
  });

  it('counts bullet points correctly', () => {
    const md = `# Title\n\n## Open questions\n- Question 1?\n* Question 2?\n\n## Next section\n`;
    expect(countOpenQuestions(md)).toBe(2);
  });
});
