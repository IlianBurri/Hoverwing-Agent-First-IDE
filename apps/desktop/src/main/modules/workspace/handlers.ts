import { BrowserWindow, dialog, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';
import type { IpcContext, ModuleHandlers } from '../../ipc/handlers';
import { UserError } from '../../ipc/errors';
import type { SettingsStore } from '../settings';
import {
  createDirectory,
  createFile,
  readDirectory,
  readTextFile,
  renameEntry,
  trashEntry,
  writeTextFile,
} from './files';
import { addRecent } from './manager';
import type { WorkspaceManager } from './manager';

function setWindowTitle(sender: IpcContext['sender'], name: string | null): void {
  BrowserWindow.fromWebContents(sender)?.setTitle(name ? `${name} — Kestrel` : 'Kestrel');
}

export function createWorkspaceHandlers(
  manager: WorkspaceManager,
  settings: SettingsStore,
  /** Called when a window opens or closes a folder (e.g. to end its terminals). */
  onWorkspaceChanged: (ownerId: number) => void = () => undefined,
): ModuleHandlers<'workspace'> {
  async function openAndRemember(sender: IpcContext['sender'], folder: string) {
    const info = await manager.openFolder(sender.id, folder);
    onWorkspaceChanged(sender.id);
    await settings.update({
      recentWorkspaces: addRecent(settings.get().recentWorkspaces, info.root),
    });
    setWindowTitle(sender, info.name);
    return info;
  }

  const root = (context: IpcContext) => manager.requireRoot(context.sender.id);

  return {
    'workspace:openDialog': async (_request, { sender }) => {
      const window = BrowserWindow.fromWebContents(sender);
      const options: OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      const folder = result.filePaths[0];
      if (result.canceled || !folder) return null;
      return openAndRemember(sender, folder);
    },
    'workspace:openRecent': async ({ root: folder }, { sender }) => {
      // Only folders the user picked before; a compromised renderer cannot
      // open arbitrary locations without the native dialog.
      if (!settings.get().recentWorkspaces.includes(folder)) {
        throw new UserError('not_found', 'Folder is not in the recent list.');
      }
      return openAndRemember(sender, folder);
    },
    'workspace:close': async (_request, { sender }) => {
      await manager.close(sender.id);
      onWorkspaceChanged(sender.id);
      setWindowTitle(sender, null);
      return null;
    },
    'workspace:get': (_request, { sender }) => manager.get(sender.id),
    'workspace:readDir': ({ path }, context) => readDirectory(root(context), path),
    'workspace:readFile': ({ path }, context) => readTextFile(root(context), path),
    'workspace:writeFile': ({ path, content, expectedMtimeMs }, context) =>
      writeTextFile(root(context), path, content, expectedMtimeMs),
    'workspace:createFile': ({ dir, name }, context) => createFile(root(context), dir, name),
    'workspace:createDirectory': ({ dir, name }, context) =>
      createDirectory(root(context), dir, name),
    'workspace:rename': ({ from, to }, context) => renameEntry(root(context), from, to),
    'workspace:trash': async ({ path }, context) => {
      await trashEntry(root(context), path, (absolute) => shell.trashItem(absolute));
      return null;
    },
  };
}
