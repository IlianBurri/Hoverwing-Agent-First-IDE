import { describe, expect, it } from 'vitest';
import type { DirEntry } from '@kestrel/shared';
import { checkEntryName, nameSelection } from './names';

const siblings: DirEntry[] = [
  { name: 'index.ts', path: 'index.ts', kind: 'file', symlink: false, heavy: false },
];

describe('checkEntryName', () => {
  it('accepts free names', () => {
    expect(checkEntryName('app.ts', siblings)).toBeNull();
  });

  it('reports problems', () => {
    expect(checkEntryName('  ', siblings)).toBe('empty');
    expect(checkEntryName('a/b', siblings)).toBe('invalidCharacters');
    expect(checkEntryName('..', siblings)).toBe('reserved');
    expect(checkEntryName('INDEX.ts', siblings)).toBe('exists');
  });

  it('allows keeping the current name when renaming', () => {
    expect(checkEntryName('index.ts', siblings, 'index.ts')).toBeNull();
  });
});

describe('nameSelection', () => {
  it('selects the name without extension', () => {
    expect(nameSelection('index.test.ts')).toEqual([0, 10]);
    expect(nameSelection('.env')).toEqual([0, 4]);
    expect(nameSelection('Makefile')).toEqual([0, 8]);
  });
});
