import { describe, expect, it } from 'vitest';
import { matchesGlob } from './glob';

describe('matchesGlob', () => {
  it('matches across folders with **', () => {
    expect(matchesGlob('src/a/b/index.ts', 'src/**')).toBe(true);
    expect(matchesGlob('.env', '**/.env*')).toBe(true);
    expect(matchesGlob('config/.env.local', '**/.env*')).toBe(true);
    expect(matchesGlob('lib/index.ts', 'src/**')).toBe(false);
  });

  it('keeps * within one folder', () => {
    expect(matchesGlob('src/index.ts', 'src/*.ts')).toBe(true);
    expect(matchesGlob('src/a/index.ts', 'src/*.ts')).toBe(false);
  });

  it('escapes regex characters and ignores case', () => {
    expect(matchesGlob('a+b.TXT', 'a+b.txt')).toBe(true);
    expect(matchesGlob('aab.txt', 'a+b.txt')).toBe(false);
    expect(matchesGlob('KEYS/Server.PEM', '**/*.pem')).toBe(true);
  });

  it('supports ? for one character', () => {
    expect(matchesGlob('v1.ts', 'v?.ts')).toBe(true);
    expect(matchesGlob('v10.ts', 'v?.ts')).toBe(false);
  });
});
