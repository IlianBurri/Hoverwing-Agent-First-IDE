import { applyPatch, structuredPatch } from 'diff';
import type { HunkSelection, ReviewHunk } from '@kestrel/shared';

/** Hunks between two versions (null = file absent). */
export function computeHunks(original: string | null, proposed: string | null): ReviewHunk[] {
  const patch = structuredPatch('a', 'b', original ?? '', proposed ?? '', undefined, undefined, {
    context: 3,
  });
  return patch.hunks.map((hunk, index) => ({
    index,
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    lines: hunk.lines,
  }));
}

export function countLines(hunks: readonly ReviewHunk[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) additions++;
      else if (line.startsWith('-')) deletions++;
    }
  }
  return { additions, deletions };
}

/**
 * The result of keeping only some hunks: the original with the selected
 * hunks applied. Returns null when the file should not exist.
 */
export function applySelection(
  original: string | null,
  proposed: string | null,
  keep: HunkSelection,
): string | null {
  if (keep === 'all') return proposed;
  if (keep === 'none') return original;
  // Whole-file additions and deletions cannot be split meaningfully.
  if (original === null || proposed === null) return keep.length > 0 ? proposed : original;

  const patch = structuredPatch('a', 'b', original, proposed, undefined, undefined, { context: 3 });
  const kept = { ...patch, hunks: patch.hunks.filter((_hunk, index) => keep.includes(index)) };
  // Skipped hunks shift later line numbers; let applyPatch handle offsets.
  const result = applyPatch(original, kept, { fuzzFactor: 0 });
  if (result === false) throw new Error('Could not apply the selected hunks.');
  return result;
}
