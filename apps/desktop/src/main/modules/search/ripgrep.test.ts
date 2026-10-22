import { describe, expect, it } from 'vitest';
import { parseRipgrepLine, ripgrepArgs } from './ripgrep';

const options = {
  query: 'todo',
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  include: '',
  exclude: '',
};

describe('ripgrepArgs', () => {
  it('searches literally and case-insensitively by default', () => {
    const args = ripgrepArgs(options);
    expect(args).toContain('--fixed-strings');
    expect(args).toContain('--ignore-case');
    expect(args.slice(-3)).toEqual(['--', 'todo', '.']);
  });

  it('skips heavy folders and applies include/exclude globs', () => {
    const args = ripgrepArgs({ ...options, include: 'src/**', exclude: '*.test.ts, dist' });
    expect(args).toContain('!**/node_modules/**');
    expect(args).toContain('!**/.git/**');
    expect(args).toContain('src/**');
    expect(args).toContain('!*.test.ts');
    expect(args).toContain('!dist');
  });

  it('keeps a query that looks like an option after "--"', () => {
    const args = ripgrepArgs({ ...options, query: '--files' });
    expect(args.indexOf('--files')).toBeGreaterThan(args.indexOf('--'));
  });
});

describe('parseRipgrepLine', () => {
  it('converts byte offsets to character offsets', () => {
    const line = JSON.stringify({
      type: 'match',
      data: {
        path: { text: './src/ä.ts' },
        lines: { text: 'const ä = "todo";\n' },
        line_number: 3,
        // "const ä = \"" is 11 characters but 12 bytes.
        submatches: [{ match: { text: 'todo' }, start: 12, end: 16 }],
      },
    });
    expect(parseRipgrepLine(line)).toEqual({
      path: 'src/ä.ts',
      matches: [{ line: 3, column: 11, length: 4, preview: 'const ä = "todo";', previewStart: 11 }],
    });
  });

  it('ignores other message types and garbage', () => {
    expect(parseRipgrepLine(JSON.stringify({ type: 'begin', data: {} }))).toBeNull();
    expect(parseRipgrepLine('not json')).toBeNull();
  });
});
