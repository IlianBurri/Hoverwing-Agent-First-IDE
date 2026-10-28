export {
  createDirectory,
  createFile,
  readDirectory,
  readTextFile,
  renameEntry,
  trashEntry,
  writeTextFile,
} from './files';
export { WorkspaceManager, addRecent } from './manager';
export { watchWorkspace } from './watcher';
export { createWorkspaceHandlers, workspaceOpener } from './handlers';
export type { OpenWorkspaceFolder } from './handlers';
export { isHeavyDirectory } from './heavy';
export { resolveInWorkspace } from './paths';
