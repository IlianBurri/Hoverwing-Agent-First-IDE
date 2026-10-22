import { describe, expect, it } from 'vitest';
import { baseName, entryNameSchema, joinPath, parentPath, relativePathSchema } from './workspace';

describe('entryNameSchema', () => {
  it('accepts normal names', () => {
    expect(entryNameSchema.safeParse('index.ts').success).toBe(true);
    expect(entryNameSchema.safeParse('.env.example').success).toBe(true);
  });

  it('rejects separators and dot segments', () => {
    for (const name of ['a/b', 'a\\b', '.', '..', '', 'x\0']) {
      expect(entryNameSchema.safeParse(name).success).toBe(false);
    }
  });
});

describe('relativePathSchema', () => {
  it('rejects NUL bytes', () => {
    expect(relativePathSchema.safeParse('src/\0index.ts').success).toBe(false);
  });
});

describe('path helpers', () => {
  it('splits and joins relative paths', () => {
    expect(parentPath('src/app/index.ts')).toBe('src/app');
    expect(parentPath('README.md')).toBe('');
    expect(baseName('src/app/index.ts')).toBe('index.ts');
    expect(joinPath('', 'README.md')).toBe('README.md');
    expect(joinPath('src', 'index.ts')).toBe('src/index.ts');
  });
});
