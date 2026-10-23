import { execFile } from 'node:child_process';
import { devNull } from 'node:os';

export interface GitResult {
  stdout: string;
}

/**
 * Runs git with an isolated configuration: the user's global/system config
 * (hooks, LFS filters, autocrlf …) must not influence checkpoints.
 */
export function runGit(
  args: readonly string[],
  options: {
    gitDir: string;
    workTree: string;
    indexFile?: string;
    input?: string;
    /** Without --git-dir/--work-tree (e.g. for `git init <dir>`). */
    plain?: boolean;
  },
): Promise<GitResult> {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'],
    SYSTEMROOT: process.env['SYSTEMROOT'],
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: devNull,
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Kestrel',
    GIT_AUTHOR_EMAIL: 'checkpoints@kestrel.local',
    GIT_COMMITTER_NAME: 'Kestrel',
    GIT_COMMITTER_EMAIL: 'checkpoints@kestrel.local',
    ...(options.indexFile ? { GIT_INDEX_FILE: options.indexFile } : {}),
  };
  const location = options.plain
    ? []
    : ['--git-dir', options.gitDir, '--work-tree', options.workTree];
  const fullArgs = [
    ...location,
    '-c',
    'core.autocrlf=false',
    '-c',
    'core.safecrlf=false',
    '-c',
    'core.quotepath=false',
    ...args,
  ];
  return new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      fullArgs,
      { cwd: options.workTree, env, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`git ${args[0] ?? ''} failed: ${stderr || error.message}`));
        else resolve({ stdout });
      },
    );
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}

/** True if a usable git is installed. */
export function gitAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('git', ['--version'], (error) => {
      resolve(!error);
    });
  });
}
