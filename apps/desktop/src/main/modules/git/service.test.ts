import { execFileSync } from 'node:child_process';
import { existsSync, statSync, utimesSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitService } from './service';
import { runGitProcess } from './runner';

const hasGit = (() => {
  try {
    execFileSync('git', ['--version']);
    return true;
  } catch {
    return false;
  }
})();

const OWNER = 3;
let dir: string;
let root: string;
let trusted: boolean;
let service: GitService;
const trash = vi.fn((path: string) => rm(path));

const env = () => ({
  PATH: process.env['PATH'] ?? '',
  ...(process.env['SYSTEMROOT'] ? { SYSTEMROOT: process.env['SYSTEMROOT'] } : {}),
  HOME: dir,
  USERPROFILE: dir,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: env(), encoding: 'utf8' });
}

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'kestrel-git-')));
  root = join(dir, 'repo');
  await mkdir(root);
  trusted = true;
  trash.mockClear();
  service = new GitService({
    run: runGitProcess,
    isTrusted: () => Promise.resolve(trusted),
    trash,
    env,
    log: () => undefined,
    onChanged: () => undefined,
  });
});

afterEach(async () => {
  service.releaseAll();
  await rm(dir, { recursive: true, force: true });
});

describe.skipIf(!hasGit)('GitService', () => {
  it('reports a folder without repository and creates one', async () => {
    expect(await service.status(OWNER, root)).toEqual({ state: 'noRepo' });
    await service.init(root);
    expect(await service.status(OWNER, root)).toMatchObject({ state: 'repo', head: null });
  });

  it('stages, unstages, commits and shows both sides of a diff', async () => {
    await service.init(root);
    await writeFile(join(root, 'a [1].txt'), 'one\n');
    await service.stage(root, ['a [1].txt']);
    let status = await service.status(OWNER, root);
    expect(status.state === 'repo' && status.files).toEqual([
      { path: 'a [1].txt', origPath: null, staged: 'added', unstaged: null, conflict: false },
    ]);
    // Before the first commit, unstaging uses "rm --cached".
    await service.unstage(root, ['a [1].txt']);
    status = await service.status(OWNER, root);
    expect(status.state === 'repo' && status.files[0]?.unstaged).toBe('untracked');

    await service.stage(root, ['a [1].txt']);
    await service.commit(root, 'first commit');
    await writeFile(join(root, 'a [1].txt'), 'two\n');
    expect(await service.diff(root, 'a [1].txt', false)).toEqual({
      original: 'one\n',
      modified: 'two\n',
    });
    await service.stage(root, ['a [1].txt']);
    expect(await service.diff(root, 'a [1].txt', true)).toEqual({
      original: 'one\n',
      modified: 'two\n',
    });
    await service.unstage(root, ['a [1].txt']);
    status = await service.status(OWNER, root);
    expect(status.state === 'repo' && status.files[0]).toMatchObject({
      staged: null,
      unstaged: 'modified',
    });
    await expect(service.commit(root, 'empty')).rejects.toMatchObject({
      code: 'git_nothing_to_commit',
    });
  });

  it('discards tracked changes with git and moves untracked files to the trash', async () => {
    git(root, 'init', '-q');
    await writeFile(join(root, 'kept.txt'), 'original\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'init');
    await writeFile(join(root, 'kept.txt'), 'changed\n');
    await writeFile(join(root, 'new.txt'), 'new\n');
    await service.discard(OWNER, root, ['kept.txt', 'new.txt']);
    expect(await readFile(join(root, 'kept.txt'), 'utf8')).toBe('original\n');
    expect(trash).toHaveBeenCalledWith(join(root, 'new.txt'));
    expect(existsSync(join(root, 'new.txt'))).toBe(false);
  });

  it('lists, creates and switches branches', async () => {
    git(root, 'init', '-q', '-b', 'main');
    await writeFile(join(root, 'a.txt'), 'a\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'init');
    await service.createBranch(root, 'feature/x');
    expect(await service.branches(root)).toEqual([
      { name: 'feature/x', current: true, remoteOnly: false },
      { name: 'main', current: false, remoteOnly: false },
    ]);
    await service.checkout(root, 'main');
    const status = await service.status(OWNER, root);
    expect(status.state === 'repo' && status.branch).toBe('main');
    await expect(service.createBranch(root, 'main')).rejects.toMatchObject({
      code: 'already_exists',
    });
  });

  it('pushes a new branch to the remote and tracks it', async () => {
    const remote = join(dir, 'remote.git');
    git(dir, 'init', '-q', '--bare', remote);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'remote', 'add', 'origin', remote);
    await writeFile(join(root, 'a.txt'), 'a\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'init');
    await service.push(OWNER, root);
    const status = await service.status(OWNER, root);
    expect(status.state === 'repo' && status.upstream).toBe('origin/main');
    expect(git(remote, 'log', '--oneline', 'main')).toContain('init');
  });

  it('gives only network commands the credential environment, and releases it', async () => {
    const remote = join(dir, 'remote.git');
    git(dir, 'init', '-q', '--bare', remote);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'remote', 'add', 'origin', remote);
    await writeFile(join(root, 'a.txt'), 'a\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'init');
    const release = vi.fn();
    const seen: string[][] = [];
    const credentialed = new GitService({
      run: (args, options) => {
        if (options.env['KESTREL_TEST_CREDENTIALS']) seen.push([...args].slice(4, 5));
        return runGitProcess(args, options);
      },
      isTrusted: () => Promise.resolve(true),
      trash,
      env,
      log: () => undefined,
      onChanged: () => undefined,
      credentials: () => Promise.resolve({ env: { KESTREL_TEST_CREDENTIALS: '1' }, release }),
    });
    await credentialed.push(OWNER, root);
    await credentialed.fetch(root);
    await credentialed.clone(dir, remote, 'copy');
    expect(seen).toEqual([['push'], ['fetch'], ['clone']]);
    expect(release).toHaveBeenCalledTimes(3);
    expect(existsSync(join(dir, 'copy', '.git'))).toBe(true);
    credentialed.releaseAll();
  });

  it('shows only the project part of a parent repository', async () => {
    git(root, 'init', '-q');
    const project = join(root, 'app');
    await mkdir(project);
    await writeFile(join(project, 'in.txt'), '1');
    await writeFile(join(root, 'out.txt'), '1');
    const status = await service.status(OWNER, project);
    expect(status).toMatchObject({ state: 'repo', nested: true });
    expect(status.state === 'repo' && status.files.map((file) => file.path)).toEqual(['in.txt']);
  });

  it('refuses writes in untrusted projects', async () => {
    git(root, 'init', '-q');
    await writeFile(join(root, 'a.txt'), 'a');
    trusted = false;
    await expect(service.stage(root, ['a.txt'])).rejects.toMatchObject({ code: 'not_trusted' });
    await expect(service.commit(root, 'x')).rejects.toMatchObject({ code: 'not_trusted' });
    await expect(service.stage(root, ['../outside'])).rejects.toMatchObject({
      code: 'not_trusted',
    });
    trusted = true;
    await expect(service.stage(root, ['../outside'])).rejects.toMatchObject({
      code: 'outside_workspace',
    });
  });

  it('never runs filters from the repository config while untrusted', async () => {
    const marker = join(dir, 'filter-ran');
    git(root, 'init', '-q');
    await writeFile(join(root, '.gitattributes'), '*.txt filter=evil\n');
    await writeFile(join(root, 'a.txt'), 'same size!\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'init');
    git(
      root,
      'config',
      'filter.evil.clean',
      `node -e "require('fs').writeFileSync(process.argv[1],'x')" "${marker}"`,
    );
    // Same size and mtime: git must re-read the file (racy clean) and would run the filter.
    const { mtime } = statSync(join(root, 'a.txt'));
    await writeFile(join(root, 'a.txt'), 'SAME SIZE!\n');
    utimesSync(join(root, 'a.txt'), mtime, mtime);

    trusted = false;
    const status = await service.status(OWNER, root);
    expect(status.state === 'repo' && status.files.map((file) => file.path)).toEqual(['a.txt']);
    expect(existsSync(marker)).toBe(false);
  });
});
