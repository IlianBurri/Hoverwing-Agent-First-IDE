import {
  FilePlus,
  FolderOpen,
  FolderPlus,
  FolderX,
  ListCollapse,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { ParseKeys } from 'i18next';
import { i18next } from '../../i18n';
import { collapseAll, loadDir, useWorkspaceStore } from '../../stores/workspace';
import { registerCommands } from '../commands';
import type { Command } from '../commands';
import { closeFolder, createEntry, openFolder, renameEntry, trashEntry } from './actions';

const t =
  (key: ParseKeys): (() => string) =>
  () =>
    i18next.t(key);

const hasWorkspace = () => useWorkspaceStore.getState().info !== null;
const hasSelection = () => hasWorkspace() && useWorkspaceStore.getState().selected !== null;

export function registerWorkspaceCommands(): () => void {
  const category = t('commands.category.files');
  const commands: Command[] = [
    {
      id: 'workspace.openFolder',
      category,
      title: t('workspace.openFolder'),
      icon: FolderOpen,
      keybinding: 'Mod+O',
      run: openFolder,
    },
    {
      id: 'workspace.closeFolder',
      category,
      title: t('workspace.closeFolder'),
      icon: FolderX,
      when: hasWorkspace,
      run: closeFolder,
    },
    {
      id: 'files.newFile',
      category,
      title: t('workspace.newFile'),
      icon: FilePlus,
      when: hasWorkspace,
      run: () => createEntry('file'),
    },
    {
      id: 'files.newFolder',
      category,
      title: t('workspace.newFolder'),
      icon: FolderPlus,
      when: hasWorkspace,
      run: () => createEntry('directory'),
    },
    {
      id: 'files.rename',
      category,
      title: t('workspace.renameSelected'),
      icon: Pencil,
      when: hasSelection,
      run: async () => {
        const { selected } = useWorkspaceStore.getState();
        if (selected) await renameEntry(selected);
      },
    },
    {
      id: 'files.trash',
      category,
      title: t('workspace.trashSelected'),
      icon: Trash2,
      when: hasSelection,
      run: async () => {
        const { selected } = useWorkspaceStore.getState();
        if (selected) await trashEntry(selected);
      },
    },
    {
      id: 'files.refresh',
      category,
      title: t('workspace.refresh'),
      icon: RefreshCw,
      when: hasWorkspace,
      run: () => loadDir(''),
    },
    {
      id: 'files.collapseAll',
      category,
      title: t('workspace.collapseAll'),
      icon: ListCollapse,
      when: hasWorkspace,
      run: collapseAll,
    },
  ];
  return registerCommands(commands);
}
