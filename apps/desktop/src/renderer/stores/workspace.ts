import { create } from 'zustand';
import { parentPath } from '@kestrel/shared';
import type { DirEntry, IpcErrorCode, WorkspaceChanges, WorkspaceInfo } from '@kestrel/shared';

export interface DirState {
  entries: readonly DirEntry[] | null;
  loading: boolean;
  error: IpcErrorCode | null;
}

interface WorkspaceState {
  info: WorkspaceInfo | null;
  /** Loaded folders by relative path ("" = root). */
  dirs: Readonly<Record<string, DirState>>;
  expanded: ReadonlySet<string>;
  /** Focused/selected entry in the file tree. */
  selected: string | null;
}

const initialState: WorkspaceState = {
  info: null,
  dirs: {},
  expanded: new Set(),
  selected: null,
};

export const useWorkspaceStore = create<WorkspaceState>()(() => initialState);

export function setWorkspace(info: WorkspaceInfo | null): void {
  useWorkspaceStore.setState({ ...initialState, info, expanded: new Set() });
  if (info) void loadDir('');
}

/** Loads (or reloads) one folder's entries. */
export async function loadDir(path: string): Promise<void> {
  const update = (patch: Partial<DirState>) => {
    useWorkspaceStore.setState((state) => {
      const previous = state.dirs[path] ?? { entries: null, loading: false, error: null };
      return { dirs: { ...state.dirs, [path]: { ...previous, ...patch } } };
    });
  };
  update({ loading: true });
  const result = await window.kestrel.invoke('workspace:readDir', { path });
  if (result.ok) update({ entries: result.data, loading: false, error: null });
  else update({ loading: false, error: result.error.code });
}

export function setExpanded(path: string, expanded: boolean): void {
  const state = useWorkspaceStore.getState();
  if (state.expanded.has(path) === expanded) return;
  const next = new Set(state.expanded);
  if (expanded) next.add(path);
  else next.delete(path);
  useWorkspaceStore.setState({ expanded: next });
  if (expanded && !state.dirs[path]?.entries) void loadDir(path);
}

export function collapseAll(): void {
  useWorkspaceStore.setState({ expanded: new Set() });
}

export function select(path: string | null): void {
  useWorkspaceStore.setState({ selected: path });
}

/** Expands every ancestor so `path` becomes visible, then selects it. */
export function reveal(path: string): void {
  const segments = path.split('/');
  for (let index = 1; index < segments.length; index++) {
    setExpanded(segments.slice(0, index).join('/'), true);
  }
  select(path);
}

/**
 * Which loaded folders must be re-read after these changes: the parents of
 * changed entries, if they are loaded. On overflow, every loaded folder.
 */
export function dirsToReload(
  changes: WorkspaceChanges,
  loaded: Readonly<Record<string, DirState>>,
): string[] {
  if (changes.overflow) return Object.keys(loaded);
  const dirs = new Set<string>();
  for (const change of changes.changes) {
    // Content updates do not change the tree.
    if (change.type === 'update') continue;
    const parent = parentPath(change.path);
    if (loaded[parent]) dirs.add(parent);
  }
  return [...dirs];
}

/** Forgets state for deleted folders (and everything below them). */
export function pruneDeleted(changes: WorkspaceChanges): void {
  const deleted = changes.changes.filter((change) => change.type === 'delete').map((c) => c.path);
  if (deleted.length === 0) return;
  const isGone = (path: string) =>
    deleted.some((gone) => path === gone || path.startsWith(`${gone}/`));
  useWorkspaceStore.setState((state) => ({
    dirs: Object.fromEntries(Object.entries(state.dirs).filter(([path]) => !isGone(path))),
    expanded: new Set([...state.expanded].filter((path) => !isGone(path))),
    selected: state.selected && isGone(state.selected) ? null : state.selected,
  }));
}

export function applyWorkspaceChanges(changes: WorkspaceChanges): void {
  pruneDeleted(changes);
  for (const dir of dirsToReload(changes, useWorkspaceStore.getState().dirs)) void loadDir(dir);
}
