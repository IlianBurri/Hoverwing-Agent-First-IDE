import { open, readdir, rename, mkdir, stat, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { dirname } from 'node:path';
import type { DirEntry, FileContent, WriteResult } from '@kestrel/shared';
import { joinPath } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { isHeavyDirectory } from './heavy';
import { resolveInWorkspace } from './paths';

/** Files larger than this are not opened in the editor. */
export const MAX_EDITABLE_FILE_SIZE = 5 * 1024 * 1024;
/** Bytes inspected to decide whether a file is binary. */
const BINARY_SNIFF_BYTES = 8000;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Folders first, then natural name order ("file2" before "file10"). */
export function compareEntries(a: DirEntry, b: DirEntry): number {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
  return collator.compare(a.name, b.name);
}

export async function readDirectory(root: string, dir: string): Promise<DirEntry[]> {
  const absolute = await resolveInWorkspace(root, dir);
  const dirents = await readdir(absolute, { withFileTypes: true });
  const entries = await Promise.all(dirents.map((dirent) => toEntry(absolute, dir, dirent)));
  return entries.filter((entry): entry is DirEntry => entry !== null).sort(compareEntries);
}

async function toEntry(absoluteDir: string, dir: string, dirent: Dirent): Promise<DirEntry | null> {
  let isDirectory = dirent.isDirectory();
  const symlink = dirent.isSymbolicLink();
  if (symlink) {
    // Only symlinks need a stat call; a broken link is shown as a file.
    isDirectory = await stat(`${absoluteDir}/${dirent.name}`).then(
      (info) => info.isDirectory(),
      () => false,
    );
  } else if (!isDirectory && !dirent.isFile()) {
    return null; // sockets, devices, FIFOs
  }
  return {
    name: dirent.name,
    path: joinPath(dir, dirent.name),
    kind: isDirectory ? 'directory' : 'file',
    symlink,
    heavy: isDirectory && isHeavyDirectory(dirent.name),
  };
}

export function looksBinary(sample: Uint8Array): boolean {
  return sample.includes(0);
}

export async function readTextFile(root: string, path: string): Promise<FileContent> {
  const absolute = await resolveInWorkspace(root, path);
  const handle = await open(absolute, 'r');
  try {
    const info = await handle.stat();
    if (info.isDirectory()) throw new UserError('not_found', 'Not a file.');
    if (info.size > MAX_EDITABLE_FILE_SIZE) {
      return { kind: 'tooLarge', size: info.size, limit: MAX_EDITABLE_FILE_SIZE };
    }
    const buffer = await handle.readFile();
    if (looksBinary(buffer.subarray(0, BINARY_SNIFF_BYTES))) {
      return { kind: 'binary', size: info.size };
    }
    return { kind: 'text', content: buffer.toString('utf8'), mtimeMs: info.mtimeMs };
  } finally {
    await handle.close();
  }
}

/**
 * Writes a text file. With `expectedMtimeMs`, nothing is written if the file
 * changed on disk in the meantime (e.g. by an agent), so no edit is lost.
 */
export async function writeTextFile(
  root: string,
  path: string,
  content: string,
  expectedMtimeMs?: number,
): Promise<WriteResult> {
  const absolute = await resolveInWorkspace(root, path);
  if (expectedMtimeMs !== undefined) {
    const current = await stat(absolute).catch(() => null);
    if (current && Math.abs(current.mtimeMs - expectedMtimeMs) > 1) return { status: 'conflict' };
  }
  await writeFile(absolute, content, 'utf8');
  return { status: 'saved', mtimeMs: (await stat(absolute)).mtimeMs };
}

export async function createFile(root: string, dir: string, name: string): Promise<string> {
  const path = joinPath(dir, name);
  const absolute = await resolveInWorkspace(root, path);
  await mkdir(dirname(absolute), { recursive: true });
  // "wx" fails if the file exists, so nothing is ever overwritten.
  await writeFile(absolute, '', { flag: 'wx' });
  return path;
}

export async function createDirectory(root: string, dir: string, name: string): Promise<string> {
  const path = joinPath(dir, name);
  const absolute = await resolveInWorkspace(root, path);
  await mkdir(absolute);
  return path;
}

/** Renames or moves. Never overwrites an existing target. */
export async function renameEntry(root: string, from: string, to: string): Promise<string> {
  if (from === '')
    throw new UserError('permission_denied', 'The workspace root cannot be renamed.');
  if (to === from || to.startsWith(`${from}/`)) {
    throw new UserError('already_exists', 'A folder cannot be moved into itself.');
  }
  const source = await resolveInWorkspace(root, from);
  const target = await resolveInWorkspace(root, to);
  const exists = await stat(target).then(
    () => true,
    () => false,
  );
  if (exists) throw new UserError('already_exists', 'Target already exists.');
  await rename(source, target);
  return to;
}

export async function trashEntry(
  root: string,
  path: string,
  moveToTrash: (absolute: string) => Promise<void>,
): Promise<void> {
  if (path === '')
    throw new UserError('permission_denied', 'The workspace root cannot be deleted.');
  const absolute = await resolveInWorkspace(root, path);
  await stat(absolute);
  await moveToTrash(absolute);
}
