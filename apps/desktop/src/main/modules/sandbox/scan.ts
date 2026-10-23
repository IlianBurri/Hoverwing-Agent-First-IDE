import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isSensitivePath } from '@kestrel/shared';
import { isHeavyDirectory } from '../workspace';
import type { HiddenPaths } from './plan';

/** A folder is secret when everything in it is (e.g. ".ssh/**"). */
function isSensitiveDirectory(path: string): boolean {
  return isSensitivePath(`${path}/kestrel-probe`);
}

/**
 * Finds the secret files and folders of a project, so the sandbox can cover
 * them. Heavy folders (node_modules, …) and .git are skipped; symlinks are not
 * followed (outside targets do not exist in the container anyway).
 */
export async function findSensitivePaths(root: string): Promise<HiddenPaths> {
  const files: string[] = [];
  const dirs: string[] = [];
  const pending: string[] = [''];
  while (pending.length > 0) {
    const dir = pending.pop() ?? '';
    let entries;
    try {
      entries = await readdir(join(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (isSensitiveDirectory(path)) dirs.push(path);
        else if (entry.name !== '.git' && !isHeavyDirectory(entry.name)) pending.push(path);
      } else if (entry.isFile() && isSensitivePath(path)) {
        files.push(path);
      }
    }
  }
  return { files: files.sort(), dirs: dirs.sort() };
}
