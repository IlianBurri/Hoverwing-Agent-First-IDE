import { z } from 'zod';

/**
 * Paths between renderer and main are always relative to the workspace root,
 * use "/" as separator, and "" means the root itself. The main process
 * re-checks every path; this schema only rejects obvious garbage.
 */
export const relativePathSchema = z
  .string()
  .max(4096)
  .refine((value) => !value.includes('\0'), 'Path must not contain NUL bytes.');

/** A single file or folder name (no separators). */
export const entryNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !/[/\\\0]/.test(value) && value !== '.' && value !== '..', 'Invalid name.');

export const workspaceInfoSchema = z.object({
  /** Folder name, shown in the UI. */
  name: z.string(),
  /** Absolute path, shown in the UI (e.g. recent list, tooltips). */
  root: z.string(),
});
export type WorkspaceInfo = z.infer<typeof workspaceInfoSchema>;

export const dirEntrySchema = z.object({
  name: z.string(),
  path: relativePathSchema,
  kind: z.enum(['file', 'directory']),
  symlink: z.boolean(),
  /** Large generated folders (node_modules, .git, …): shown, not watched or searched. */
  heavy: z.boolean(),
});
export type DirEntry = z.infer<typeof dirEntrySchema>;

export const fileContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), content: z.string(), mtimeMs: z.number() }),
  z.object({ kind: z.literal('binary'), size: z.number() }),
  z.object({ kind: z.literal('tooLarge'), size: z.number(), limit: z.number() }),
]);
export type FileContent = z.infer<typeof fileContentSchema>;

export const writeResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('saved'), mtimeMs: z.number() }),
  /** The file changed on disk since it was read; nothing was written. */
  z.object({ status: z.literal('conflict') }),
]);
export type WriteResult = z.infer<typeof writeResultSchema>;

export const fileChangeSchema = z.object({
  type: z.enum(['create', 'update', 'delete']),
  path: relativePathSchema,
});
export type FileChange = z.infer<typeof fileChangeSchema>;

export const workspaceChangesSchema = z.object({
  changes: z.array(fileChangeSchema),
  /** Too many changes at once: the renderer should reload everything it shows. */
  overflow: z.boolean(),
});
export type WorkspaceChanges = z.infer<typeof workspaceChangesSchema>;

/** Parent folder of a relative path ("" for top-level entries). */
export function parentPath(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

/** Last segment of a relative path. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function joinPath(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`;
}
