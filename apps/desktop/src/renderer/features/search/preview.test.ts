import { describe, expect, it } from 'vitest';
import { previewParts } from './preview';

const options = {
  query: 'v(\\d)',
  isRegex: true,
  caseSensitive: false,
  wholeWord: false,
  include: '',
  exclude: '',
};
const match = { line: 1, column: 8, length: 2, preview: '  const v1 = 1;', previewStart: 8 };

describe('previewParts', () => {
  it('splits the line around the match', () => {
    expect(previewParts(match, options, null)).toEqual({
      before: 'const ',
      match: 'v1',
      replacement: null,
      after: ' = 1;',
    });
  });

  it('computes the replacement with groups', () => {
    expect(previewParts(match, options, 'version$1').replacement).toBe('version1');
  });
});
