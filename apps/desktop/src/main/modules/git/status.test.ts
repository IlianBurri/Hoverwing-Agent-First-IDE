import { describe, expect, it } from 'vitest';
import { classifyGitError } from './errors';
import { parseStatus, toProjectPaths } from './status';

const hash = '1234567890abcdef1234567890abcdef12345678';

describe('parseStatus', () => {
  it('reads branch headers and all record types', () => {
    const output = [
      `# branch.oid ${hash}`,
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
      `1 M. N... 100644 100644 100644 ${hash} ${hash} src/staged.ts`,
      `1 .D N... 100644 100644 000000 ${hash} ${hash} gone file.txt`,
      `1 AM N... 000000 100644 100644 ${hash} ${hash} new.ts`,
      `2 R. N... 100644 100644 100644 ${hash} ${hash} R100 renamed.ts`,
      'old name.ts',
      `u UU N... 100644 100644 100644 100644 ${hash} ${hash} ${hash} conflict.ts`,
      '? docs/untracked.md',
      '',
    ].join('\0');
    expect(parseStatus(output)).toEqual({
      branch: 'main',
      head: '1234567',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
      files: [
        {
          path: 'src/staged.ts',
          origPath: null,
          staged: 'modified',
          unstaged: null,
          conflict: false,
        },
        {
          path: 'gone file.txt',
          origPath: null,
          staged: null,
          unstaged: 'deleted',
          conflict: false,
        },
        { path: 'new.ts', origPath: null, staged: 'added', unstaged: 'modified', conflict: false },
        {
          path: 'renamed.ts',
          origPath: 'old name.ts',
          staged: 'renamed',
          unstaged: null,
          conflict: false,
        },
        { path: 'conflict.ts', origPath: null, staged: null, unstaged: 'modified', conflict: true },
        {
          path: 'docs/untracked.md',
          origPath: null,
          staged: null,
          unstaged: 'untracked',
          conflict: false,
        },
      ],
    });
  });

  it('handles a new repository and a detached HEAD', () => {
    expect(parseStatus('# branch.oid (initial)\0# branch.head main\0')).toMatchObject({
      branch: 'main',
      head: null,
      upstream: null,
      ahead: 0,
    });
    expect(parseStatus(`# branch.oid ${hash}\0# branch.head (detached)\0`).branch).toBeNull();
  });
});

describe('toProjectPaths', () => {
  it('strips the project prefix and drops files outside the project', () => {
    const file = (path: string, origPath: string | null = null) => ({
      path,
      origPath,
      staged: null,
      unstaged: 'modified' as const,
      conflict: false,
    });
    expect(
      toProjectPaths(
        [file('app/src/a.ts'), file('other/b.ts'), file('app/c.ts', 'old/c.ts')],
        'app/',
      ),
    ).toEqual([file('src/a.ts'), file('c.ts', null)]);
  });
});

describe('classifyGitError', () => {
  it.each([
    ['fatal: not a git repository (or any of the parent directories): .git', 'git_not_repo'],
    [
      'fatal: could not read Username for https://github.com: terminal prompts disabled',
      'git_auth',
    ],
    ['git@github.com: Permission denied (publickey).', 'git_auth'],
    [' ! [rejected]        main -> main (fetch first)', 'git_rejected'],
    [
      'error: Your local changes to the following files would be overwritten by checkout',
      'git_conflict',
    ],
    ['CONFLICT (content): Merge conflict in a.ts', 'git_conflict'],
    ['nothing to commit, working tree clean', 'git_nothing_to_commit'],
    ["fatal: a branch named 'x' already exists", 'already_exists'],
    ['something else', 'git_failed'],
  ])('%s -> %s', (stderr, code) => {
    expect(classifyGitError(stderr).code).toBe(code);
  });
});
