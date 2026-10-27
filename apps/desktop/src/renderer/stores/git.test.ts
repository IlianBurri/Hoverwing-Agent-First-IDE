import { describe, expect, it } from 'vitest';
import type { GitFile } from '@kestrel/shared';
import { groupFiles, setGitStatus, useGitStore } from './git';

const file = (path: string, patch: Partial<GitFile>): GitFile => ({
  path,
  origPath: null,
  staged: null,
  unstaged: null,
  conflict: false,
  ...patch,
});

const files = [
  file('src/b.ts', { staged: 'modified', unstaged: 'modified' }),
  file('a.ts', { staged: 'added' }),
  file('docs/new.md', { unstaged: 'untracked' }),
  file('x.ts', { unstaged: 'modified', conflict: true }),
  file('src/deep/gone.ts', { unstaged: 'deleted' }),
];

describe('git store', () => {
  it('groups files into the panel sections (a file can be staged and changed)', () => {
    const groups = groupFiles(files);
    expect(groups.conflicts.map((f) => f.path)).toEqual(['x.ts']);
    expect(groups.staged.map((f) => f.path)).toEqual(['a.ts', 'src/b.ts']);
    expect(groups.changes.map((f) => f.path)).toEqual(['src/b.ts', 'src/deep/gone.ts']);
    expect(groups.untracked.map((f) => f.path)).toEqual(['docs/new.md']);
  });

  it('derives tree decorations and changed folders from the status', () => {
    setGitStatus({
      state: 'repo',
      branch: 'main',
      head: 'abc1234',
      upstream: null,
      ahead: 0,
      behind: 0,
      files,
      nested: false,
    });
    const { decorations, changedFolders } = useGitStore.getState();
    expect(decorations.get('src/b.ts')).toEqual({ letter: 'M', kind: 'modified' });
    expect(decorations.get('a.ts')).toEqual({ letter: 'A', kind: 'added' });
    expect(decorations.get('docs/new.md')).toEqual({ letter: 'U', kind: 'untracked' });
    expect(decorations.get('x.ts')).toEqual({ letter: '!', kind: 'conflict' });
    expect([...changedFolders].sort()).toEqual(['docs', 'src', 'src/deep']);

    setGitStatus({ state: 'noRepo' });
    expect(useGitStore.getState().decorations.size).toBe(0);
  });
});
