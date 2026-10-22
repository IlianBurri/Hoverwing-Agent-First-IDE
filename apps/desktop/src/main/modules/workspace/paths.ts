import { realpath } from 'node:fs/promises';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { UserError } from '../../ipc/errors';

/** True if `target` is `root` or lies inside it (pure string check). */
export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/**
 * Turns a renderer-supplied relative path into an absolute path inside the
 * workspace, or throws. Rejects absolute paths, "..", drive letters, and
 * (via realpath) symlinks that point outside the workspace.
 */
export async function resolveInWorkspace(root: string, relativePath: string): Promise<string> {
  const outside = new UserError('outside_workspace', 'Path is outside the workspace.');
  if (isAbsolute(relativePath) || /^[a-zA-Z]:/.test(relativePath) || relativePath.includes('\\')) {
    throw outside;
  }
  const absolute = resolve(root, normalize(relativePath));
  if (!isInside(root, absolute)) throw outside;

  // Follow symlinks: the real location must be inside the real root too.
  const realRoot = await realpath(root);
  const realTarget = await realpathOfNearestExisting(absolute);
  if (!isInside(realRoot, realTarget)) throw outside;
  return absolute;
}

/** realpath of the path, or of its closest existing parent (for new files). */
async function realpathOfNearestExisting(path: string): Promise<string> {
  let current = path;
  const missing: string[] = [];
  for (;;) {
    try {
      const real = await realpath(current);
      return missing.length ? resolve(real, ...missing.reverse()) : real;
    } catch (error) {
      const parent = resolve(current, '..');
      if (parent === current || !isMissing(error)) throw error;
      missing.push(relative(parent, current));
      current = parent;
    }
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Absolute path -> relative path with "/" separators. */
export function toRelative(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/');
}
