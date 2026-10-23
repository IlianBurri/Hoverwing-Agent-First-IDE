import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findSensitivePaths } from './scan';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kestrel-scan-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function touch(path: string) {
  await mkdir(join(root, path, '..'), { recursive: true });
  await writeFile(join(root, path), 'x');
}

describe('findSensitivePaths', () => {
  it('finds secret files and folders, skipping heavy folders', async () => {
    await touch('.env');
    await touch('app/.env.local');
    await touch('certs/server.key');
    await touch('.ssh/id_ed25519');
    await touch('src/index.ts');
    await touch('node_modules/pkg/.env');
    await touch('.git/config');
    expect(await findSensitivePaths(root)).toEqual({
      files: ['.env', 'app/.env.local', 'certs/server.key'],
      dirs: ['.ssh'],
    });
  });

  it('returns nothing for a clean project', async () => {
    await touch('README.md');
    expect(await findSensitivePaths(root)).toEqual({ files: [], dirs: [] });
  });
});
