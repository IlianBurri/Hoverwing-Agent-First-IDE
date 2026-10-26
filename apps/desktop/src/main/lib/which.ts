import { access } from 'node:fs/promises';
import { posix, win32 } from 'node:path';

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface FindProgramOptions {
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
  /** Folder that relative paths like ./server.js are resolved against. */
  cwd?: string;
  exists?: (path: string) => Promise<boolean>;
}

/**
 * Finds a program like the shell would: a path is checked directly, a bare
 * name is searched in PATH. On Windows the PATHEXT endings (.exe, .cmd …)
 * are tried as well, so `npx` finds `npx.cmd`.
 */
export async function findProgram(
  command: string,
  { platform, env, cwd, exists = pathExists }: FindProgramOptions,
): Promise<string | null> {
  const windows = platform === 'win32';
  const path = windows ? win32 : posix;
  const endings = windows
    ? [
        '',
        ...(env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD')
          .split(';')
          .filter(Boolean)
          .map((ending) => ending.toLowerCase()),
      ]
    : [''];
  const hasSeparator = windows ? /[\\/]/.test(command) : command.includes('/');
  const bases = hasSeparator
    ? [path.isAbsolute(command) || !cwd ? command : path.join(cwd, command)]
    : (env['PATH'] ?? env['Path'] ?? '')
        .split(windows ? ';' : ':')
        .filter(Boolean)
        .map((dir) => path.join(dir, command));
  for (const base of bases) {
    for (const ending of endings) {
      if (await exists(base + ending)) return base + ending;
    }
  }
  return null;
}
