import type { DirEntry } from '@kestrel/shared';
import type { DirState } from '../../stores/workspace';

export interface TreeRow {
  entry: DirEntry;
  depth: number;
  expanded: boolean;
  loading: boolean;
  /** 1-based position among siblings, for aria-posinset/aria-setsize. */
  position: number;
  siblings: number;
}

/**
 * Turns the loaded folders into the list of visible rows (depth-first),
 * which is what the virtualized tree renders.
 */
export function flattenTree(
  dirs: Readonly<Record<string, DirState>>,
  expanded: ReadonlySet<string>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (dir: string, depth: number) => {
    const entries = dirs[dir]?.entries ?? [];
    entries.forEach((entry, index) => {
      const isOpen = entry.kind === 'directory' && expanded.has(entry.path);
      rows.push({
        entry,
        depth,
        expanded: isOpen,
        loading: isOpen && (dirs[entry.path]?.loading ?? true) && !dirs[entry.path]?.entries,
        position: index + 1,
        siblings: entries.length,
      });
      if (isOpen) visit(entry.path, depth + 1);
    });
  };
  visit('', 0);
  return rows;
}
