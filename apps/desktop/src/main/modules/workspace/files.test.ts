import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_EDITABLE_FILE_SIZE,
  createDirectory,
  createFile,
  readDirectory,
  readTextFile,
  renameEntry,
  trashEntry,
  writeTextFile,
} from './files';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kestrel-files-'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'node_modules'));
  await writeFile(join(root, 'file10.txt'), '');
  await writeFile(join(root, 'file2.txt'), '');
  await writeFile(join(root, 'src', 'index.ts'), 'export {};\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('readDirectory', () => {
  it('lists folders first in natural order and marks heavy folders', async () => {
    const entries = await readDirectory(root, '');
    expect(entries.map((entry) => entry.name)).toEqual([
      'node_modules',
      'src',
      'file2.txt',
      'file10.txt',
    ]);
    expect(entries[0]).toMatchObject({ kind: 'directory', heavy: true, path: 'node_modules' });
    expect(entries[1]).toMatchObject({ heavy: false, path: 'src' });
  });

  it('builds relative child paths', async () => {
    const entries = await readDirectory(root, 'src');
    expect(entries).toEqual([
      { name: 'index.ts', path: 'src/index.ts', kind: 'file', symlink: false, heavy: false },
    ]);
  });

  it('handles 10,000 entries quickly', async () => {
    await mkdir(join(root, 'many'));
    // In batches: Windows limits how many files may be open at once.
    for (let start = 0; start < 10_000; start += 500) {
      await Promise.all(
        Array.from({ length: 500 }, (_, offset) =>
          writeFile(join(root, 'many', `f${start + offset}.txt`), ''),
        ),
      );
    }
    const started = performance.now();
    const entries = await readDirectory(root, 'many');
    expect(entries).toHaveLength(10_000);
    expect(entries[1]?.name).toBe('f1.txt');
    expect(performance.now() - started).toBeLessThan(1000);
    // Creating the files is slow on Windows; only reading them is measured.
  }, 60_000);
});

describe('readTextFile', () => {
  it('reads text with its modification time', async () => {
    const content = await readTextFile(root, 'src/index.ts');
    expect(content).toMatchObject({ kind: 'text', content: 'export {};\n' });
  });

  it('detects binary files', async () => {
    await writeFile(join(root, 'image.png'), Buffer.from([0x89, 0x50, 0x00, 0x47]));
    expect(await readTextFile(root, 'image.png')).toEqual({ kind: 'binary', size: 4 });
  });

  it('refuses files above the size limit', async () => {
    await writeFile(join(root, 'big.log'), Buffer.alloc(MAX_EDITABLE_FILE_SIZE + 1, 'a'));
    expect(await readTextFile(root, 'big.log')).toMatchObject({ kind: 'tooLarge' });
  });
});

describe('writeTextFile', () => {
  it('saves and returns the new modification time', async () => {
    const result = await writeTextFile(root, 'src/index.ts', 'changed');
    expect(result.status).toBe('saved');
    expect(await readFile(join(root, 'src', 'index.ts'), 'utf8')).toBe('changed');
  });

  it('reports a conflict if the file changed on disk', async () => {
    const before = await stat(join(root, 'src', 'index.ts'));
    const result = await writeTextFile(root, 'src/index.ts', 'mine', before.mtimeMs - 10_000);
    expect(result).toEqual({ status: 'conflict' });
    expect(await readFile(join(root, 'src', 'index.ts'), 'utf8')).toBe('export {};\n');
  });
});

describe('create, rename, trash', () => {
  it('creates files and folders without overwriting', async () => {
    await expect(createFile(root, 'src', 'new.ts')).resolves.toBe('src/new.ts');
    await expect(createFile(root, 'src', 'new.ts')).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(createDirectory(root, '', 'lib')).resolves.toBe('lib');
  });

  it('renames and moves, but never onto an existing entry', async () => {
    await expect(renameEntry(root, 'file2.txt', 'src/file2.txt')).resolves.toBe('src/file2.txt');
    await expect(renameEntry(root, 'file10.txt', 'src/index.ts')).rejects.toMatchObject({
      code: 'already_exists',
    });
  });

  it('refuses to move a folder into itself or touch the root', async () => {
    await expect(renameEntry(root, 'src', 'src/inner')).rejects.toMatchObject({
      code: 'already_exists',
    });
    await expect(renameEntry(root, '', 'x')).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(trashEntry(root, '', vi.fn())).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  it('moves entries to the trash through the given function', async () => {
    const moveToTrash = vi.fn(() => Promise.resolve());
    await trashEntry(root, 'src/index.ts', moveToTrash);
    expect(moveToTrash).toHaveBeenCalledWith(join(root, 'src', 'index.ts'));
  });
});
