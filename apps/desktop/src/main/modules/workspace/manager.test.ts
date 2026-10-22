import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceManager, addRecent } from './manager';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-manager-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makeManager() {
  const close = vi.fn(() => Promise.resolve());
  const watch = vi.fn(() => Promise.resolve({ close }));
  const manager = new WorkspaceManager({ watch, onChanges: vi.fn() });
  return { manager, watch, close };
}

describe('WorkspaceManager', () => {
  it('requires an open workspace for file operations', () => {
    const { manager } = makeManager();
    expect(() => manager.requireRoot(1)).toThrow(expect.objectContaining({ code: 'no_workspace' }));
  });

  it('opens one workspace per window and closes the previous watcher', async () => {
    const { manager, watch, close } = makeManager();
    const info = await manager.openFolder(1, dir);
    expect(info.root).toBeTruthy();
    expect(manager.requireRoot(1)).toBe(info.root);
    expect(manager.get(2)).toBeNull();

    await manager.openFolder(1, dir);
    expect(watch).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
  });

  it('refuses files as workspace', async () => {
    const { manager } = makeManager();
    await writeFile(join(dir, 'file.txt'), '');
    await expect(manager.openFolder(1, join(dir, 'file.txt'))).rejects.toMatchObject({
      code: 'not_a_directory',
    });
  });

  it('still opens when watching fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const manager = new WorkspaceManager({
      watch: () => Promise.reject(new Error('too many watchers')),
      onChanges: vi.fn(),
    });
    const info = await manager.openFolder(1, dir);
    expect(manager.requireRoot(1)).toBe(info.root);
  });
});

describe('addRecent', () => {
  it('moves the root to the front without duplicates', () => {
    expect(addRecent(['/b', '/a', '/c'], '/a')).toEqual(['/a', '/b', '/c']);
    expect(addRecent(['/1', '/2', '/3'], '/4', 3)).toEqual(['/4', '/1', '/2']);
  });
});
