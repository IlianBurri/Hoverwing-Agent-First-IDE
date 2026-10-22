import { baseName, joinPath, parentPath } from '@kestrel/shared';
import type { WorkspaceInfo } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { confirm, prompt } from '../../stores/dialogs';
import { notify } from '../../stores/toasts';
import {
  loadDir,
  reveal,
  setExpanded,
  setWorkspace,
  useWorkspaceStore,
} from '../../stores/workspace';
import { checkEntryName, nameSelection } from './names';

const t = i18next.t.bind(i18next);

function opened(info: WorkspaceInfo | null): void {
  if (info) setWorkspace(info);
}

export async function openFolder(): Promise<void> {
  const result = await window.kestrel.invoke('workspace:openDialog');
  if (result.ok) opened(result.data);
  else notifyError(t('workspace.openFolder'), result.error);
}

export async function openRecent(root: string): Promise<void> {
  const result = await window.kestrel.invoke('workspace:openRecent', { root });
  if (result.ok) opened(result.data);
  else notifyError(t('workspace.openFolder'), result.error);
}

export async function closeFolder(): Promise<void> {
  await window.kestrel.invoke('workspace:close');
  setWorkspace(null);
}

/** The folder new entries go into: the selected folder, or the selection's parent. */
export function targetDirectory(): string {
  const { selected, dirs } = useWorkspaceStore.getState();
  if (selected === null) return '';
  const parent = parentPath(selected);
  const isDir = dirs[parent]?.entries?.some(
    (entry) => entry.path === selected && entry.kind === 'directory',
  );
  return isDir ? selected : parent;
}

function siblingsOf(dir: string) {
  return useWorkspaceStore.getState().dirs[dir]?.entries ?? [];
}

function nameValidator(dir: string, currentName?: string) {
  return (value: string) => {
    const problem = checkEntryName(value, siblingsOf(dir), currentName);
    return problem ? t(`workspace.nameProblem.${problem}`) : null;
  };
}

export async function createEntry(kind: 'file' | 'directory', dir = targetDirectory()) {
  const name = await prompt({
    title: t(kind === 'file' ? 'workspace.newFile' : 'workspace.newFolder'),
    label: dir ? t('workspace.inFolder', { folder: dir }) : t('workspace.inRoot'),
    confirmLabel: t('workspace.create'),
    validate: nameValidator(dir),
  });
  if (name === null) return;
  const channel = kind === 'file' ? 'workspace:createFile' : 'workspace:createDirectory';
  const result = await window.kestrel.invoke(channel, { dir, name: name.trim() });
  if (!result.ok) {
    notifyError(t(kind === 'file' ? 'workspace.newFile' : 'workspace.newFolder'), result.error);
    return;
  }
  if (dir) setExpanded(dir, true);
  await loadDir(dir);
  reveal(result.data);
}

export async function renameEntry(path: string): Promise<void> {
  const dir = parentPath(path);
  const currentName = baseName(path);
  const name = await prompt({
    title: t('workspace.rename'),
    label: t('workspace.newName'),
    initialValue: currentName,
    selection: nameSelection(currentName),
    confirmLabel: t('workspace.rename'),
    validate: nameValidator(dir, currentName),
  });
  if (name === null || name.trim() === currentName) return;
  await moveTo(path, joinPath(dir, name.trim()), t('workspace.rename'));
}

/** Drag and drop: moves `path` into the folder `targetDir`. */
export async function moveEntry(path: string, targetDir: string): Promise<void> {
  if (parentPath(path) === targetDir) return;
  await moveTo(path, joinPath(targetDir, baseName(path)), t('workspace.move'));
}

async function moveTo(from: string, to: string, action: string): Promise<void> {
  const result = await window.kestrel.invoke('workspace:rename', { from, to });
  if (!result.ok) {
    notifyError(action, result.error);
    return;
  }
  await Promise.all([loadDir(parentPath(from)), loadDir(parentPath(to))]);
  reveal(result.data);
}

export async function trashEntry(path: string): Promise<void> {
  const name = baseName(path);
  const confirmed = await confirm({
    title: t('workspace.trashTitle', { name }),
    message: t('workspace.trashMessage'),
    confirmLabel: t('workspace.trash'),
    danger: true,
  });
  if (!confirmed) return;
  const result = await window.kestrel.invoke('workspace:trash', { path });
  if (!result.ok) {
    notifyError(t('workspace.trash'), result.error);
    return;
  }
  await loadDir(parentPath(path));
  notify('success', t('workspace.trashed', { name }));
}
