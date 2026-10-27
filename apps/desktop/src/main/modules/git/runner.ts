import { execFile } from 'node:child_process';

export interface GitRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface GitRunOptions {
  cwd: string;
  env: Record<string, string>;
  input?: string;
  timeoutMs?: number;
}

/** Runs git; a non-zero exit is a result, only a missing git rejects (ENOENT). */
export type RunGit = (args: readonly string[], options: GitRunOptions) => Promise<GitRunResult>;

const MAX_OUTPUT = 64 * 1024 * 1024;

export const runGitProcess: RunGit = (args, options) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      [...args],
      {
        cwd: options.cwd,
        env: options.env,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT,
        timeout: options.timeoutMs ?? 30_000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error && 'code' in error && error.code === 'ENOENT') {
          reject(Object.assign(new Error('git is not installed.'), { code: 'ENOENT' }));
          return;
        }
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        resolve({ code, stdout, stderr: error && !stderr ? error.message : stderr });
      },
    );
    // git may exit without reading its input (e.g. "nothing to commit").
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(options.input ?? '');
  });
