import { describe, expect, it } from 'vitest';
import type { DirEntry } from '@kestrel/shared';
import { dirsToReload } from '../../stores/workspace';
import type { DirState } from '../../stores/workspace';
import { flattenTree } from './flatten';

function entry(path: string, kind: DirEntry['kind'] = 'file'): DirEntry {
  return { name: path.split('/').pop() ?? path, path, kind, symlink: false, heavy: false };
}

function loaded(entries: DirEntry[]): DirState {
  return { entries, loading: false, error: null };
}

const dirs = {
  '': loaded([entry('src', 'directory'), entry('docs', 'directory'), entry('README.md')]),
  src: loaded([entry('src/app', 'directory'), entry('src/index.ts')]),
};

describe('flattenTree', () => {
  it('shows only top-level entries when nothing is expanded', () => {
    const rows = flattenTree(dirs, new Set());
    expect(rows.map((row) => row.entry.path)).toEqual(['src', 'docs', 'README.md']);
    expect(rows[2]).toMatchObject({ depth: 0, position: 3, siblings: 3 });
  });

  it('inserts children of expanded folders depth-first', () => {
    const rows = flattenTree(dirs, new Set(['src']));
    expect(rows.map((row) => [row.entry.path, row.depth])).toEqual([
      ['src', 0],
      ['src/app', 1],
      ['src/index.ts', 1],
      ['docs', 0],
      ['README.md', 0],
    ]);
  });

  it('marks expanded folders that are still loading', () => {
    const rows = flattenTree(dirs, new Set(['docs']));
    expect(rows.find((row) => row.entry.path === 'docs')).toMatchObject({
      expanded: true,
      loading: true,
    });
  });

  it('flattens 10,000 entries fast', () => {
    const many = Array.from({ length: 10_000 }, (_, index) => entry(`f${String(index)}`));
    const started = performance.now();
    expect(flattenTree({ '': loaded(many) }, new Set())).toHaveLength(10_000);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe('dirsToReload', () => {
  it('reloads loaded parents of created and deleted entries', () => {
    const changes = {
      changes: [
        { type: 'create' as const, path: 'src/new.ts' },
        { type: 'delete' as const, path: 'docs/old.md' },
        { type: 'update' as const, path: 'README.md' },
      ],
      overflow: false,
    };
    expect(dirsToReload(changes, dirs)).toEqual(['src']);
  });

  it('reloads everything on overflow', () => {
    expect(dirsToReload({ changes: [], overflow: true }, dirs)).toEqual(['', 'src']);
  });
});
