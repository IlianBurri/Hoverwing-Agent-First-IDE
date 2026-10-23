import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShadowRepo, parseNameStatus } from './shadowRepo';

let base: string;
let root: string;
let repo: ShadowRepo;

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'kestrel-checkpoints-'));
  root = join(base, 'project');
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'dep'), { recursive: true });
  await writeFile(join(root, 'src', 'a.ts'), 'a1\n');
  await writeFile(join(root, 'README.md'), '# Demo\n');
  await writeFile(join(root, '.env'), 'SECRET=1\n');
  await writeFile(join(root, 'node_modules', 'dep', 'index.js'), '');
  repo = new ShadowRepo(join(base, 'data', 'shadow.git'), root);
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('ShadowRepo', () => {
  it('creates and lists checkpoints with metadata', async () => {
    const first = await repo.create('Before: add feature', 'turn', 's1');
    await repo.create('Manual', 'manual');
    const list = await repo.list();
    expect(list.map((entry) => entry.label)).toEqual(['Manual', 'Before: add feature']);
    expect(list[1]).toMatchObject({ id: first.id, kind: 'turn', sessionId: 's1' });
  });

  it('reports changes since a checkpoint, ignoring secrets and heavy folders', async () => {
    const checkpoint = await repo.create('start', 'turn');
    await writeFile(join(root, 'src', 'a.ts'), 'a2\n');
    await writeFile(join(root, 'src', 'b.ts'), 'new\n');
    await rm(join(root, 'README.md'));
    await writeFile(join(root, '.env'), 'SECRET=2\n');
    await writeFile(join(root, 'node_modules', 'dep', 'index.js'), 'changed');
    const changes = await repo.changesSince(checkpoint.id);
    expect(changes).toEqual([
      { path: 'README.md', status: 'deleted' },
      { path: 'src/a.ts', status: 'modified' },
      { path: 'src/b.ts', status: 'added' },
    ]);
  });

  it('restores everything to the checkpoint', async () => {
    const checkpoint = await repo.create('start', 'turn');
    await writeFile(join(root, 'src', 'a.ts'), 'broken\n');
    await writeFile(join(root, 'src', 'b.ts'), 'new\n');
    await rm(join(root, 'README.md'));

    await expect(repo.restore(checkpoint.id)).resolves.toBe(3);
    expect(await readFile(join(root, 'src', 'a.ts'), 'utf8')).toBe('a1\n');
    expect(await readFile(join(root, 'README.md'), 'utf8')).toBe('# Demo\n');
    expect(await exists(join(root, 'src', 'b.ts'))).toBe(false);
    expect(await repo.changesSince(checkpoint.id)).toEqual([]);
  });

  it('restores single files only', async () => {
    const checkpoint = await repo.create('start', 'turn');
    await writeFile(join(root, 'src', 'a.ts'), 'a2\n');
    await writeFile(join(root, 'README.md'), 'changed\n');
    await repo.restore(checkpoint.id, ['src/a.ts']);
    expect(await readFile(join(root, 'src', 'a.ts'), 'utf8')).toBe('a1\n');
    expect(await readFile(join(root, 'README.md'), 'utf8')).toBe('changed\n');
  });

  it('returns file contents at a checkpoint', async () => {
    const checkpoint = await repo.create('start', 'turn');
    await writeFile(join(root, 'src', 'a.ts'), 'a2\n');
    expect(await repo.fileAt(checkpoint.id, 'src/a.ts')).toBe('a1\n');
    expect(await repo.fileAt(checkpoint.id, 'src/missing.ts')).toBeNull();
  });

  it('never touches the project’s own git repository', async () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const before = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    await repo.create('start', 'turn');
    await writeFile(join(root, 'src', 'a.ts'), 'a2\n');
    const checkpoint = (await repo.list())[0];
    if (checkpoint) await repo.restore(checkpoint.id);
    const refs = execFileSync('git', ['for-each-ref'], { cwd: root, encoding: 'utf8' });
    expect(refs).toBe('');
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })).toBe(
      before,
    );
  });
});

describe('parseNameStatus', () => {
  it('handles paths with spaces and umlauts', () => {
    expect(parseNameStatus('M\0src/größe datei.ts\0A\0b.ts\0')).toEqual([
      { path: 'src/größe datei.ts', status: 'modified' },
      { path: 'b.ts', status: 'added' },
    ]);
  });
});
