import type { WorkspaceChanges } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { choose } from '../../stores/dialogs';
import {
  getFile,
  neighbourAfterClose,
  renamedPath,
  updateFile,
  useEditorStore,
} from '../../stores/editor';
import type { OpenFile } from '../../stores/editor';

const t = i18next.t.bind(i18next);

/** Monaco is loaded on first use; every model operation goes through here. */
function models() {
  return import('./monaco/models');
}

let dirtyListenerReady = false;
async function modelsWithListener() {
  const module = await models();
  if (!dirtyListenerReady) {
    module.setDirtyListener((path, dirty) => {
      updateFile(path, { dirty });
    });
    dirtyListenerReady = true;
  }
  return module;
}

export function activate(path: string): void {
  useEditorStore.setState({ active: path });
}

/** Opens a file in a tab (or focuses its tab) and optionally moves the cursor. */
export async function openFile(
  path: string,
  reveal?: { line: number; column: number; length: number },
): Promise<void> {
  const pendingReveal = reveal ? { path, ...reveal } : null;
  if (getFile(path)) {
    useEditorStore.setState({ active: path, pendingReveal });
    return;
  }
  const result = await window.kestrel.invoke('workspace:readFile', { path });
  if (!result.ok) {
    notifyError(t('editor.open'), result.error);
    return;
  }
  const content = result.data;
  let file: OpenFile;
  if (content.kind === 'text') {
    (await modelsWithListener()).createModel(path, content.content);
    file = { path, kind: 'text', dirty: false, mtimeMs: content.mtimeMs, external: 'none' };
  } else {
    file = {
      path,
      kind: content.kind,
      size: content.size,
      dirty: false,
      mtimeMs: null,
      external: 'none',
    };
  }
  // Another open of the same file may have finished while we were loading.
  if (getFile(path)) return;
  useEditorStore.setState((state) => ({
    files: [...state.files, file],
    active: path,
    pendingReveal,
  }));
}

function forgetFile(path: string): void {
  useEditorStore.setState((state) => ({
    files: state.files.filter((file) => file.path !== path),
    active: state.active === path ? neighbourAfterClose(state.files, path) : state.active,
  }));
  void models().then((module) => {
    module.disposeModel(path);
  });
}

/** Saves one file. Returns false if it was not saved (error or cancelled). */
export async function save(path: string): Promise<boolean> {
  const file = getFile(path);
  if (file?.kind !== 'text') return false;
  const module = await models();
  const content = module.getText(path) ?? '';
  // A file deleted on disk is simply written again.
  const expectedMtimeMs = file.external === 'deleted' ? undefined : (file.mtimeMs ?? undefined);
  const result = await window.kestrel.invoke('workspace:writeFile', {
    path,
    content,
    ...(expectedMtimeMs === undefined ? {} : { expectedMtimeMs }),
  });
  if (!result.ok) {
    notifyError(t('editor.save'), result.error);
    return false;
  }
  if (result.data.status === 'conflict') return resolveConflict(path);
  module.markSaved(path);
  updateFile(path, { mtimeMs: result.data.mtimeMs, external: 'none' });
  return true;
}

/** The file changed on disk since we read it: let the user decide. */
async function resolveConflict(path: string): Promise<boolean> {
  const answer = await choose({
    title: t('editor.conflictTitle', { name: path }),
    message: t('editor.conflictMessage'),
    choices: [
      { id: 'overwrite', label: t('editor.overwrite'), variant: 'danger' },
      { id: 'reload', label: t('editor.reloadFromDisk') },
    ],
  });
  if (answer === 'overwrite') {
    updateFile(path, { external: 'deleted' }); // save without mtime check
    return save(path);
  }
  if (answer === 'reload') await reloadFromDisk(path);
  return false;
}

export async function saveAll(): Promise<void> {
  for (const file of useEditorStore.getState().files) {
    if (file.dirty) await save(file.path);
  }
}

/** Closes a tab; asks first if it has unsaved changes. */
export async function closeFile(path: string): Promise<boolean> {
  const file = getFile(path);
  if (!file) return true;
  if (file.dirty) {
    activate(path);
    const answer = await choose({
      title: t('editor.unsavedTitle', { name: path.split('/').pop() ?? path }),
      message: t('editor.unsavedMessage'),
      choices: [
        { id: 'save', label: t('editor.save'), variant: 'primary' },
        { id: 'discard', label: t('editor.discard') },
      ],
    });
    if (answer === null) return false;
    if (answer === 'save' && !(await save(path))) return false;
  }
  forgetFile(path);
  return true;
}

/** Closes every tab; false if the user cancelled for one of them. */
export async function closeAll(): Promise<boolean> {
  for (const file of [...useEditorStore.getState().files]) {
    if (!(await closeFile(file.path))) return false;
  }
  return true;
}

export function cycleTab(step: 1 | -1): void {
  const { files, active } = useEditorStore.getState();
  if (files.length === 0) return;
  const index = files.findIndex((file) => file.path === active);
  const next = files[(index + step + files.length) % files.length];
  if (next) activate(next.path);
}

export async function reloadFromDisk(path: string): Promise<void> {
  const result = await window.kestrel.invoke('workspace:readFile', { path });
  if (!result.ok || result.data.kind !== 'text') {
    if (!result.ok) notifyError(t('editor.reloadFromDisk'), result.error);
    return;
  }
  (await models()).replaceContent(path, result.data.content);
  updateFile(path, { mtimeMs: result.data.mtimeMs, external: 'none' });
}

/** Keep the user's version: the next save overwrites what is on disk. */
export async function keepMine(path: string): Promise<void> {
  const file = getFile(path);
  if (!file) return;
  if (file.external === 'deleted') return; // saving recreates the file
  const result = await window.kestrel.invoke('workspace:readFile', { path });
  if (result.ok && result.data.kind === 'text') {
    updateFile(path, { mtimeMs: result.data.mtimeMs, external: 'none' });
  }
}

/**
 * Reacts to changes on disk (agent, git, other editors). Clean tabs follow
 * the disk silently; tabs with unsaved edits get a notice instead.
 */
export async function handleExternalChanges(changes: WorkspaceChanges): Promise<void> {
  const open = useEditorStore.getState().files.filter((file) => file.kind === 'text');
  if (open.length === 0) return;
  const affected = changes.overflow
    ? open
    : open.filter((file) => changes.changes.some((change) => change.path === file.path));

  for (const file of affected) {
    const result = await window.kestrel.invoke('workspace:readFile', { path: file.path });
    const module = await models();
    if (!result.ok) {
      if (result.error.code === 'not_found') updateFile(file.path, { external: 'deleted' });
      continue;
    }
    if (result.data.kind !== 'text') continue;
    const disk = result.data;
    const current = module.getText(file.path);
    if (current === disk.content) {
      // Our own save, or a change back to what we have: nothing to do.
      updateFile(file.path, { mtimeMs: disk.mtimeMs, external: 'none' });
    } else if (!getFile(file.path)?.dirty) {
      module.replaceContent(file.path, disk.content);
      updateFile(file.path, { mtimeMs: disk.mtimeMs, external: 'none' });
    } else {
      updateFile(file.path, { external: 'changed' });
    }
  }
}

/** The file tree renamed or moved something: tabs follow along. */
export async function onPathRenamed(from: string, to: string): Promise<void> {
  const files = useEditorStore.getState().files;
  if (!files.some((file) => renamedPath(file.path, from, to))) return;
  const module = await models();
  for (const file of files) {
    const next = renamedPath(file.path, from, to);
    if (next) module.renameModel(file.path, next);
  }
  useEditorStore.setState((state) => ({
    files: state.files.map((file) => {
      const next = renamedPath(file.path, from, to);
      return next ? { ...file, path: next } : file;
    }),
    active: (state.active && renamedPath(state.active, from, to)) ?? state.active,
  }));
}

/** The file tree deleted something: clean tabs close, dirty ones stay. */
export function onPathDeleted(path: string): void {
  for (const file of useEditorStore.getState().files) {
    if (!renamedPath(file.path, path, path)) continue;
    if (file.dirty) updateFile(file.path, { external: 'deleted' });
    else forgetFile(file.path);
  }
}
