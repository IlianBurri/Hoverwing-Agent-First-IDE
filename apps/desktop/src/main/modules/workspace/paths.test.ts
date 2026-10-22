import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isInside, resolveInWorkspace, toRelative } from './paths';

let base: string;
let root: string;
let outside: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'kestrel-paths-'));
  root = join(base, 'project');
  outside = join(base, 'secret');
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(outside);
  await writeFile(join(outside, 'id_rsa'), 'secret');
  await writeFile(join(root, 'src', 'index.ts'), '');
  await symlink(outside, join(root, 'escape'));
  await symlink(join(root, 'src'), join(root, 'inner-link'));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('resolveInWorkspace', () => {
  it('resolves normal relative paths', async () => {
    await expect(resolveInWorkspace(root, 'src/index.ts')).resolves.toBe(
      join(root, 'src', 'index.ts'),
    );
    await expect(resolveInWorkspace(root, '')).resolves.toBe(root);
  });

  it('allows paths that do not exist yet (new files)', async () => {
    await expect(resolveInWorkspace(root, 'src/new/deep/file.ts')).resolves.toBe(
      join(root, 'src', 'new', 'deep', 'file.ts'),
    );
  });

  it.each([
    '../secret/id_rsa',
    'src/../../secret/id_rsa',
    '..',
    '/etc/passwd',
    'C:/Windows/system.ini',
    'src\\..\\..\\secret',
  ])('rejects %s', async (path) => {
    await expect(resolveInWorkspace(root, path)).rejects.toMatchObject({
      code: 'outside_workspace',
    });
  });

  it('rejects symlinks that point outside the workspace', async () => {
    await expect(resolveInWorkspace(root, 'escape/id_rsa')).rejects.toMatchObject({
      code: 'outside_workspace',
    });
    await expect(resolveInWorkspace(root, 'escape/new-file')).rejects.toMatchObject({
      code: 'outside_workspace',
    });
  });

  it('allows symlinks that stay inside the workspace', async () => {
    await expect(resolveInWorkspace(root, 'inner-link/index.ts')).resolves.toBe(
      join(root, 'inner-link', 'index.ts'),
    );
  });
});

describe('isInside', () => {
  it('does not confuse sibling folders with a shared prefix', () => {
    expect(isInside('/a/project', '/a/project-secret/x')).toBe(false);
    expect(isInside('/a/project', '/a/project/x')).toBe(true);
  });
});

describe('toRelative', () => {
  it('uses forward slashes', () => {
    expect(toRelative(root, join(root, 'src', 'index.ts'))).toBe('src/index.ts');
  });
});
