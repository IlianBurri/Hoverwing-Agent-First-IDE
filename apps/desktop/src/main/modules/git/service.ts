import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { GitBranch, GitDiff, GitStatus } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { redact } from '../../lib/redact';
import { resolveInWorkspace } from '../workspace/paths';
import { classifyGitError } from './errors';
import type { GitRunResult, RunGit } from './runner';
import { parseStatus, toProjectPaths } from './status';

/** Network operations may take a while (large fetches). */
const NETWORK_TIMEOUT_MS = 180_000;
/** Commits can run hooks (lint, tests). */
const COMMIT_TIMEOUT_MS = 300_000;
const MAX_DIFF_TEXT = 5 * 1024 * 1024;
const CHANGE_DEBOUNCE_MS = 300;

export interface GitServiceDeps {
  run: RunGit;
  isTrusted: (root: string) => Promise<boolean>;
  /** Moves an absolute path to the system trash. */
  trash: (absolute: string) => Promise<void>;
  /** Environment for git (without Kestrel's internal variables). */
  env: () => Record<string, string>;
  log: (line: string) => void;
  /** Status, index or refs of a window's repository changed. */
  onChanged: (ownerId: number) => void;
}

interface Watched {
  root: string;
  watchers: FSWatcher[];
  timer: ReturnType<typeof setTimeout> | null;
}

interface Repo {
  /** Project folder relative to the repository root ("" or "sub/dir/"). */
  prefix: string;
}

/**
 * The Git panel's operations on the user's repository. Reads always work
 * (with hardened flags in untrusted projects: no fsmonitor, no filters);
 * everything that writes needs a trusted project, because git then runs
 * hooks and filters from the repository's configuration.
 */
export class GitService {
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly watched = new Map<number, Watched>();

  constructor(private readonly deps: GitServiceDeps) {}

  private env(): Record<string, string> {
    const env = { ...this.deps.env() };
    // English messages, so errors can be classified; no prompts ever.
    delete env['LC_ALL'];
    return {
      ...env,
      LC_MESSAGES: 'C',
      GIT_TERMINAL_PROMPT: '0',
      GIT_EDITOR: 'true',
      GIT_MERGE_AUTOEDIT: 'no',
    };
  }

  /** One git command at a time per repository (index.lock). */
  private queue<T>(root: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(root) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(
      root,
      next.catch(() => undefined),
    );
    return next;
  }

  private async exec(
    root: string,
    args: readonly string[],
    options: { input?: string; timeoutMs?: number } = {},
  ): Promise<GitRunResult> {
    return this.deps.run(['-c', 'color.ui=false', '-c', 'core.quotepath=false', ...args], {
      cwd: root,
      env: this.env(),
      ...options,
    });
  }

  /** Runs a command and throws a user-facing error on failure (details are logged). */
  private async check(
    root: string,
    args: readonly string[],
    options: { input?: string; timeoutMs?: number } = {},
  ): Promise<GitRunResult> {
    const result = await this.exec(root, args, options);
    const output = `${result.stderr}\n${result.stdout}`.trim();
    if (result.code !== 0) {
      this.deps.log(redact(`git ${args[0] ?? ''}: ${output}`));
      throw classifyGitError(output);
    }
    if (result.stderr.trim())
      this.deps.log(redact(`git ${args[0] ?? ''}: ${result.stderr.trim()}`));
    return result;
  }

  /**
   * Flags that keep reads from running code configured in the repository
   * (fsmonitor hooks, clean/smudge filters) for untrusted projects.
   */
  private async readFlags(root: string): Promise<string[]> {
    const flags = ['--no-optional-locks', '-c', 'core.fsmonitor=false'];
    if (await this.deps.isTrusted(root)) return flags;
    const config = await this.exec(root, [
      '-c',
      'core.fsmonitor=false',
      'config',
      '--get-regexp',
      '^filter\\.',
    ]);
    const drivers = new Set<string>();
    for (const line of config.stdout.split('\n')) {
      const match = /^filter\.(.+)\.[a-z]+ /i.exec(line);
      if (match?.[1]) drivers.add(match[1]);
    }
    for (const driver of drivers) {
      for (const key of ['clean', 'smudge', 'process'])
        flags.push('-c', `filter.${driver}.${key}=`);
      flags.push('-c', `filter.${driver}.required=false`);
    }
    return flags;
  }

  private async repo(root: string): Promise<Repo | null> {
    const result = await this.exec(root, [
      '-c',
      'core.fsmonitor=false',
      'rev-parse',
      '--show-prefix',
    ]);
    if (result.code !== 0) return null;
    return { prefix: result.stdout.trim() };
  }

  private async requireRepo(root: string): Promise<Repo> {
    const repo = await this.repo(root);
    if (!repo) throw new UserError('git_not_repo', 'Not a Git repository.');
    return repo;
  }

  private async requireTrust(root: string): Promise<void> {
    if (!(await this.deps.isTrusted(root))) {
      throw new UserError('not_trusted', 'The project is not trusted.');
    }
  }

  async status(ownerId: number, root: string): Promise<GitStatus> {
    try {
      return await this.queue(root, async () => {
        const repo = await this.repo(root);
        if (!repo) return { state: 'noRepo' } as const;
        const result = await this.check(root, [
          ...(await this.readFlags(root)),
          'status',
          '--porcelain=v2',
          '-z',
          '--branch',
          '--untracked-files=all',
          '--',
          '.',
        ]);
        const parsed = parseStatus(result.stdout);
        this.ensureWatching(ownerId, root);
        return {
          state: 'repo',
          branch: parsed.branch,
          head: parsed.head,
          upstream: parsed.upstream,
          ahead: parsed.ahead,
          behind: parsed.behind,
          files: toProjectPaths(parsed.files, repo.prefix),
          nested: repo.prefix !== '',
        } as const;
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return { state: 'unavailable' };
      }
      throw error;
    }
  }

  /** Validates project paths (guard incl. symlinks) and returns them unchanged. */
  private async checkedPaths(root: string, paths: readonly string[]): Promise<string[]> {
    for (const path of paths) {
      if (path === '') throw new UserError('outside_workspace', 'Path is the project itself.');
      await resolveInWorkspace(root, path);
    }
    return [...paths];
  }

  /** Paths go through stdin (no length limit, no option injection, literal). */
  private pathInput(paths: readonly string[]): string {
    return `${paths.join('\0')}\0`;
  }

  private async blob(root: string, spec: string): Promise<string | null> {
    const result = await this.exec(root, ['--no-optional-locks', 'cat-file', 'blob', spec]);
    if (result.code !== 0) return null;
    return textOrNull(result.stdout);
  }

  async diff(root: string, path: string, staged: boolean): Promise<GitDiff> {
    const [checked] = await this.checkedPaths(root, [path]);
    return this.queue(root, async () => {
      const repo = await this.requireRepo(root);
      const repoPath = `${repo.prefix}${checked ?? path}`;
      if (staged) {
        return {
          original: await this.blob(root, `HEAD:${repoPath}`),
          modified: await this.blob(root, `:${repoPath}`),
        };
      }
      const indexed = await this.blob(root, `:${repoPath}`);
      const disk = await readFile(await resolveInWorkspace(root, path), 'utf8').catch(() => null);
      return {
        original: indexed ?? (await this.blob(root, `HEAD:${repoPath}`)),
        modified: disk === null ? null : textOrNull(disk),
      };
    });
  }

  async stage(root: string, paths: readonly string[]): Promise<void> {
    await this.requireTrust(root);
    const checked = await this.checkedPaths(root, paths);
    await this.queue(root, () =>
      this.check(
        root,
        ['--literal-pathspecs', 'add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'],
        { input: this.pathInput(checked) },
      ),
    );
  }

  async unstage(root: string, paths: readonly string[]): Promise<void> {
    await this.requireTrust(root);
    const checked = await this.checkedPaths(root, paths);
    await this.queue(root, async () => {
      const hasHead =
        (await this.exec(root, ['rev-parse', '--verify', '--quiet', 'HEAD'])).code === 0;
      // Before the first commit there is nothing to restore from.
      const args = hasHead
        ? ['restore', '--staged']
        : ['rm', '--cached', '-r', '--quiet', '--ignore-unmatch'];
      await this.check(
        root,
        ['--literal-pathspecs', ...args, '--pathspec-from-file=-', '--pathspec-file-nul'],
        { input: this.pathInput(checked) },
      );
    });
  }

  /** Drops work-tree changes. Untracked files go to the trash (recoverable). */
  async discard(ownerId: number, root: string, paths: readonly string[]): Promise<void> {
    await this.requireTrust(root);
    const checked = await this.checkedPaths(root, paths);
    const status = await this.status(ownerId, root);
    if (status.state !== 'repo') throw new UserError('git_not_repo', 'Not a Git repository.');
    const byPath = new Map(status.files.map((file) => [file.path, file]));
    const untracked = checked.filter((path) => byPath.get(path)?.unstaged === 'untracked');
    const tracked = checked.filter(
      (path) => byPath.get(path)?.unstaged && byPath.get(path)?.unstaged !== 'untracked',
    );
    for (const path of untracked) await this.deps.trash(await resolveInWorkspace(root, path));
    if (tracked.length > 0) {
      await this.queue(root, () =>
        this.check(
          root,
          [
            '--literal-pathspecs',
            'restore',
            '--worktree',
            '--pathspec-from-file=-',
            '--pathspec-file-nul',
          ],
          { input: this.pathInput(tracked) },
        ),
      );
    }
  }

  async commit(root: string, message: string): Promise<void> {
    await this.requireTrust(root);
    await this.queue(root, () =>
      this.check(root, ['commit', '--file=-'], { input: message, timeoutMs: COMMIT_TIMEOUT_MS }),
    );
  }

  async branches(root: string): Promise<GitBranch[]> {
    return this.queue(root, async () => {
      await this.requireRepo(root);
      const result = await this.check(root, [
        '--no-optional-locks',
        'for-each-ref',
        '--format=%(refname)%00%(HEAD)',
        'refs/heads',
        'refs/remotes',
      ]);
      const local: GitBranch[] = [];
      const remote = new Set<string>();
      for (const line of result.stdout.split('\n')) {
        const [ref = '', head = ''] = line.split('\0');
        if (ref.startsWith('refs/heads/')) {
          local.push({ name: ref.slice(11), current: head === '*', remoteOnly: false });
        } else if (ref.startsWith('refs/remotes/')) {
          const name = ref.slice(13).split('/').slice(1).join('/');
          if (name && name !== 'HEAD') remote.add(name);
        }
      }
      const localNames = new Set(local.map((branch) => branch.name));
      return [
        ...local,
        ...[...remote]
          .filter((name) => !localNames.has(name))
          .sort()
          .map((name) => ({ name, current: false, remoteOnly: true })),
      ];
    });
  }

  async checkout(root: string, branch: string): Promise<void> {
    await this.requireTrust(root);
    await this.queue(root, () => this.check(root, ['switch', branch]));
  }

  async createBranch(root: string, name: string): Promise<void> {
    await this.requireTrust(root);
    await this.queue(root, () => this.check(root, ['switch', '-c', name]));
  }

  async init(root: string): Promise<void> {
    await this.requireTrust(root);
    if (await this.repo(root)) return;
    await this.queue(root, () => this.check(root, ['init']));
  }

  async fetch(root: string): Promise<void> {
    await this.requireTrust(root);
    await this.queue(root, () =>
      this.check(root, ['fetch', '--prune'], { timeoutMs: NETWORK_TIMEOUT_MS }),
    );
  }

  async pull(root: string): Promise<void> {
    await this.requireTrust(root);
    await this.queue(root, () =>
      this.check(root, ['pull', '--no-edit'], { timeoutMs: NETWORK_TIMEOUT_MS }),
    );
  }

  async push(ownerId: number, root: string): Promise<void> {
    await this.requireTrust(root);
    const status = await this.status(ownerId, root);
    if (status.state !== 'repo') throw new UserError('git_not_repo', 'Not a Git repository.');
    if (status.branch === null) throw new UserError('git_failed', 'Detached HEAD.');
    const { branch, upstream } = status;
    await this.queue(root, async () => {
      if (upstream) {
        await this.check(root, ['push'], { timeoutMs: NETWORK_TIMEOUT_MS });
        return;
      }
      const remotes = (await this.check(root, ['remote'])).stdout.split('\n').filter(Boolean);
      const remote = remotes.includes('origin') ? 'origin' : remotes[0];
      if (!remote) throw new UserError('git_no_remote', 'The repository has no remote.');
      await this.check(root, ['push', '--set-upstream', remote, branch], {
        timeoutMs: NETWORK_TIMEOUT_MS,
      });
    });
  }

  /** Something in the work tree changed (workspace watcher): status may differ. */
  touch(ownerId: number): void {
    const watched = this.watched.get(ownerId);
    if (watched) this.schedule(ownerId, watched);
  }

  private schedule(ownerId: number, watched: Watched): void {
    if (watched.timer) clearTimeout(watched.timer);
    watched.timer = setTimeout(() => {
      watched.timer = null;
      this.deps.onChanged(ownerId);
    }, CHANGE_DEBOUNCE_MS);
  }

  /** Watches HEAD, index and refs (the workspace watcher ignores .git). */
  private ensureWatching(ownerId: number, root: string): void {
    const existing = this.watched.get(ownerId);
    if (existing?.root === root) return;
    this.release(ownerId);
    const watched: Watched = { root, watchers: [], timer: null };
    this.watched.set(ownerId, watched);
    void (async () => {
      const dirs = await this.exec(root, [
        'rev-parse',
        '--absolute-git-dir',
        '--path-format=absolute',
        '--git-common-dir',
      ]);
      const [gitDir, commonDir] = dirs.stdout.trim().split('\n');
      if (dirs.code !== 0 || !gitDir || this.watched.get(ownerId) !== watched) return;
      const onEvent = () => {
        this.schedule(ownerId, watched);
      };
      const targets: [string, boolean][] = [
        [gitDir, false],
        [join(commonDir ?? gitDir, 'refs'), true],
      ];
      for (const [target, recursive] of targets) {
        try {
          const watcher = watch(target, { recursive }, onEvent);
          watcher.on('error', () => undefined);
          watched.watchers.push(watcher);
        } catch {
          // Without a watcher the panel still refreshes on file changes.
        }
      }
    })();
  }

  release(ownerId: number): void {
    const watched = this.watched.get(ownerId);
    if (!watched) return;
    if (watched.timer) clearTimeout(watched.timer);
    for (const watcher of watched.watchers) watcher.close();
    this.watched.delete(ownerId);
  }

  releaseAll(): void {
    for (const ownerId of [...this.watched.keys()]) this.release(ownerId);
  }
}

function textOrNull(text: string): string | null {
  if (text.length > MAX_DIFF_TEXT || text.includes('\0')) return null;
  return text;
}
