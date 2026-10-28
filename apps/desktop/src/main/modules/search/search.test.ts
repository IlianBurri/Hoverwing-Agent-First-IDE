import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { replaceInFiles } from './replace';
import { SearchRunner, unpackedPath } from './search';

let root: string;
const options = {
  query: 'needle',
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  include: '',
  exclude: '',
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kestrel-search-'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'node_modules'));
  await writeFile(join(root, 'src', 'a.ts'), 'const needle = 1;\nconst Needle = 2;\n');
  await writeFile(join(root, 'src', 'b.ts'), 'nothing here\n');
  await writeFile(join(root, 'node_modules', 'x.js'), 'needle\n');
  await writeFile(join(root, '.env'), 'NEEDLE=secret\n');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('SearchRunner (real ripgrep)', () => {
  it('finds matches and skips heavy folders', async () => {
    const result = await new SearchRunner().find(1, root, options);
    const paths = result.files.map((file) => file.path);
    expect(paths).toContain('src/a.ts');
    expect(paths).not.toContain('node_modules/x.js');
    expect(result.files.find((file) => file.path === 'src/a.ts')?.matches).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it('respects case sensitivity and include globs', async () => {
    const result = await new SearchRunner().find(1, root, {
      ...options,
      caseSensitive: true,
      include: 'src/**',
    });
    expect(result.files).toEqual([
      expect.objectContaining({
        path: 'src/a.ts',
        matches: [expect.objectContaining({ line: 1 })],
      }),
    ]);
  });

  it('returns an empty result when nothing matches', async () => {
    const result = await new SearchRunner().find(1, root, { ...options, query: 'zzz-none' });
    expect(result).toEqual({ files: [], truncated: false });
  });
});

describe('replaceInFiles', () => {
  it('replaces with regex groups and reports counts', async () => {
    const result = await replaceInFiles(
      root,
      { ...options, query: 'const (\\w+)', isRegex: true, caseSensitive: true },
      'let $1',
      ['src/a.ts', 'src/b.ts'],
    );
    expect(result).toEqual({ filesChanged: 1, replacements: 2, failed: [] });
    expect(await readFile(join(root, 'src', 'a.ts'), 'utf8')).toBe(
      'let needle = 1;\nlet Needle = 2;\n',
    );
  });

  it('rejects invalid patterns with a user-facing error', async () => {
    await expect(
      replaceInFiles(root, { ...options, query: '(', isRegex: true }, 'x', ['src/a.ts']),
    ).rejects.toMatchObject({ code: 'invalid_pattern' });
  });

  it('reports files outside the workspace as failed', async () => {
    const result = await replaceInFiles(root, options, 'x', ['../outside.ts']);
    expect(result.failed).toEqual(['../outside.ts']);
  });
});

describe('unpackedPath', () => {
  it('points into app.asar.unpacked in the installed app', () => {
    expect(unpackedPath('C:\\Hoverwing\\resources\\app.asar\\node_modules\\rg.exe')).toBe(
      'C:\\Hoverwing\\resources\\app.asar.unpacked\\node_modules\\rg.exe',
    );
    expect(unpackedPath('/opt/Hoverwing/resources/app.asar/node_modules/rg')).toBe(
      '/opt/Hoverwing/resources/app.asar.unpacked/node_modules/rg',
    );
    expect(unpackedPath('/home/me/kestrel/node_modules/rg')).toBe(
      '/home/me/kestrel/node_modules/rg',
    );
  });
});
