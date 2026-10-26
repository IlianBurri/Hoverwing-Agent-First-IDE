/** What the editor shows right now: the file and, if any, the selected lines. */
export interface EditorSnapshot {
  path: string;
  language: string;
  /** Selected text, or the whole file without a selection. */
  text: string;
  lines: { start: number; end: number } | null;
}

/**
 * Monaco is lazy-loaded, so features that need its content (e.g. the chat
 * attaching a file) ask through this small bridge instead of importing it.
 */
let source: (() => EditorSnapshot | null) | null = null;

export function setSnapshotSource(next: (() => EditorSnapshot | null) | null): void {
  source = next;
}

export function editorSnapshot(): EditorSnapshot | null {
  return source?.() ?? null;
}
