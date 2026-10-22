import type { editor } from 'monaco-editor';
import { monaco } from './setup';

interface ModelEntry {
  model: editor.ITextModel;
  /** Alternative version id at the last save; equal to current = not dirty. */
  savedVersion: number;
  viewState: editor.ICodeEditorViewState | null;
  /** Last dirty state reported to the listener. */
  reportedDirty: boolean;
  listener: { dispose(): void };
}

const entries = new Map<string, ModelEntry>();

function uriFor(path: string) {
  return monaco.Uri.from({ scheme: 'kestrel', path: `/${path}` });
}

export type DirtyListener = (path: string, dirty: boolean) => void;
let onDirtyChange: DirtyListener = () => undefined;

export function setDirtyListener(listener: DirtyListener): void {
  onDirtyChange = listener;
}

function isEntryDirty(entry: ModelEntry): boolean {
  return entry.model.getAlternativeVersionId() !== entry.savedVersion;
}

/** Tells the listener when the dirty state flips (not on every keystroke). */
function report(path: string, entry: ModelEntry): void {
  const dirty = isEntryDirty(entry);
  if (dirty === entry.reportedDirty) return;
  entry.reportedDirty = dirty;
  onDirtyChange(path, dirty);
}

/** Creates the model for a file; the language is derived from its name. */
export function createModel(path: string, content: string): editor.ITextModel {
  disposeModel(path);
  const model = monaco.editor.createModel(content, undefined, uriFor(path));
  const entry: ModelEntry = {
    model,
    savedVersion: model.getAlternativeVersionId(),
    viewState: null,
    reportedDirty: false,
    listener: { dispose: () => undefined },
  };
  entry.listener = model.onDidChangeContent(() => {
    report(path, entry);
  });
  entries.set(path, entry);
  return model;
}

export function getModel(path: string): editor.ITextModel | undefined {
  return entries.get(path)?.model;
}

export function getText(path: string): string | undefined {
  return entries.get(path)?.model.getValue();
}

export function isDirty(path: string): boolean {
  const entry = entries.get(path);
  return entry ? isEntryDirty(entry) : false;
}

export function markSaved(path: string): void {
  const entry = entries.get(path);
  if (!entry) return;
  entry.savedVersion = entry.model.getAlternativeVersionId();
  report(path, entry);
}

/** Replaces the content with what is on disk (keeps undo history). */
export function replaceContent(path: string, content: string): void {
  const entry = entries.get(path);
  if (!entry) return;
  entry.model.pushEditOperations(
    [],
    [{ range: entry.model.getFullModelRange(), text: content }],
    () => null,
  );
  markSaved(path);
}

export function saveViewState(path: string, state: editor.ICodeEditorViewState | null): void {
  const entry = entries.get(path);
  if (entry) entry.viewState = state;
}

export function getViewState(path: string): editor.ICodeEditorViewState | null {
  return entries.get(path)?.viewState ?? null;
}

/** Monaco URIs are fixed, so a rename creates a new model with the same text. */
export function renameModel(from: string, to: string): void {
  const entry = entries.get(from);
  if (!entry) return;
  const dirty = isEntryDirty(entry);
  createModel(to, entry.model.getValue());
  const moved = entries.get(to);
  if (moved) {
    moved.viewState = entry.viewState;
    if (dirty) moved.savedVersion = -1;
  }
  disposeModel(from);
  if (moved) report(to, moved);
}

export function disposeModel(path: string): void {
  const entry = entries.get(path);
  if (!entry) return;
  entry.listener.dispose();
  entry.model.dispose();
  entries.delete(path);
}

export function languageOf(path: string): string | undefined {
  return entries.get(path)?.model.getLanguageId();
}
