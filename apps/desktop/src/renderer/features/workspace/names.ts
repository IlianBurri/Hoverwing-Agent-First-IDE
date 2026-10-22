import type { DirEntry } from '@kestrel/shared';

export type NameProblem = 'empty' | 'invalidCharacters' | 'reserved' | 'exists' | null;

/** Checks a file or folder name before asking main to create/rename it. */
export function checkEntryName(
  name: string,
  siblings: readonly DirEntry[],
  currentName?: string,
): NameProblem {
  const trimmed = name.trim();
  if (trimmed === '') return 'empty';
  if (/[/\\\0]/.test(trimmed)) return 'invalidCharacters';
  if (trimmed === '.' || trimmed === '..') return 'reserved';
  const lower = trimmed.toLowerCase();
  // Case-insensitive, because macOS and Windows file systems usually are.
  const taken = siblings.some(
    (entry) => entry.name.toLowerCase() === lower && entry.name !== currentName,
  );
  return taken ? 'exists' : null;
}

/** Selection for a rename field: the name without its extension. */
export function nameSelection(name: string): [number, number] {
  const dot = name.lastIndexOf('.');
  return [0, dot > 0 ? dot : name.length];
}
