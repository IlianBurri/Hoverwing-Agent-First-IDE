import { describe, expect, it } from 'vitest';
import { buildSearchRegExp, splitGlobs } from './search';

const base = { isRegex: false, caseSensitive: false, wholeWord: false };

describe('buildSearchRegExp', () => {
  it('escapes plain text', () => {
    const regExp = buildSearchRegExp({ ...base, query: 'a.b(c)' });
    expect('a.b(c) axb(c)'.match(regExp)).toEqual(['a.b(c)']);
  });

  it('respects case sensitivity', () => {
    expect('Foo foo'.match(buildSearchRegExp({ ...base, query: 'foo' }))).toEqual(['Foo', 'foo']);
    expect(
      'Foo foo'.match(buildSearchRegExp({ ...base, query: 'foo', caseSensitive: true })),
    ).toEqual(['foo']);
  });

  it('matches whole words only', () => {
    const regExp = buildSearchRegExp({ ...base, query: 'cat', wholeWord: true });
    expect('cat concat cat.'.match(regExp)).toEqual(['cat', 'cat']);
  });

  it('supports regular expressions with groups', () => {
    const regExp = buildSearchRegExp({ ...base, query: 'v(\\d+)', isRegex: true });
    expect('v1 v22'.replace(regExp, 'version $1')).toBe('version 1 version 22');
  });

  it('throws for invalid regular expressions', () => {
    expect(() => buildSearchRegExp({ ...base, query: '(', isRegex: true })).toThrow(SyntaxError);
  });
});

describe('splitGlobs', () => {
  it('splits and trims', () => {
    expect(splitGlobs(' src/**, *.ts ,, ')).toEqual(['src/**', '*.ts']);
  });
});
