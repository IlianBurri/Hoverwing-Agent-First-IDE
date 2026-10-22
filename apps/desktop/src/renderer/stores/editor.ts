import { create } from 'zustand';

export type ExternalState = 'none' | 'changed' | 'deleted';

export interface OpenFile {
  path: string;
  /** What the editor can show: text in Monaco, or a notice for the others. */
  kind: 'text' | 'binary' | 'tooLarge';
  size?: number;
  dirty: boolean;
  /** Modification time of the version on disk we last read or wrote. */
  mtimeMs: number | null;
  /** Set when the file changed or vanished on disk while it had unsaved edits. */
  external: ExternalState;
}

export interface CursorInfo {
  line: number;
  column: number;
  language: string;
  eol: 'LF' | 'CRLF';
}

interface EditorState {
  files: readonly OpenFile[];
  active: string | null;
  cursor: CursorInfo | null;
  /** A request to move the cursor, consumed by the Monaco host. */
  pendingReveal: { path: string; line: number; column: number; length: number } | null;
}

export const useEditorStore = create<EditorState>()(() => ({
  files: [],
  active: null,
  cursor: null,
  pendingReveal: null,
}));

export function updateFile(path: string, patch: Partial<OpenFile>): void {
  useEditorStore.setState((state) => ({
    files: state.files.map((file) => (file.path === path ? { ...file, ...patch } : file)),
  }));
}

export function getFile(path: string): OpenFile | undefined {
  return useEditorStore.getState().files.find((file) => file.path === path);
}

export function hasDirtyFiles(): boolean {
  return useEditorStore.getState().files.some((file) => file.dirty);
}

/** The tab to activate after closing `path`: right neighbour, else left. */
export function neighbourAfterClose(files: readonly OpenFile[], path: string): string | null {
  const index = files.findIndex((file) => file.path === path);
  if (index === -1) return null;
  const next = files[index + 1] ?? files[index - 1];
  return next?.path ?? null;
}

/** Maps a path through a rename/move of `from` to `to` (also for children). */
export function renamedPath(path: string, from: string, to: string): string | null {
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
  return null;
}
