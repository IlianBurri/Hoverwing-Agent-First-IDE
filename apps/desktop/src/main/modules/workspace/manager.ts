import { realpath, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { WorkspaceChanges, WorkspaceInfo } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import type { WorkspaceWatcher } from './watcher';

export interface OpenWorkspace {
  info: WorkspaceInfo;
  watcher: WorkspaceWatcher | null;
}

export interface WorkspaceManagerDeps {
  watch: (
    root: string,
    onChanges: (changes: WorkspaceChanges) => void,
  ) => Promise<WorkspaceWatcher>;
  /** Called with the changes of the workspace that belongs to `ownerId`. */
  onChanges: (ownerId: number, changes: WorkspaceChanges) => void;
}

/**
 * Keeps one open workspace per window (owner id = webContents id).
 * Every file operation goes through `requireRoot`, so nothing happens
 * without an open workspace.
 */
export class WorkspaceManager {
  private readonly open = new Map<number, OpenWorkspace>();

  constructor(private readonly deps: WorkspaceManagerDeps) {}

  get(ownerId: number): WorkspaceInfo | null {
    return this.open.get(ownerId)?.info ?? null;
  }

  requireRoot(ownerId: number): string {
    const workspace = this.open.get(ownerId);
    if (!workspace) throw new UserError('no_workspace', 'No folder is open.');
    return workspace.info.root;
  }

  async openFolder(ownerId: number, folder: string): Promise<WorkspaceInfo> {
    const root = await realpath(folder);
    if (!(await stat(root)).isDirectory()) {
      throw new UserError('not_a_directory', 'Not a folder.');
    }
    await this.close(ownerId);
    const info: WorkspaceInfo = { name: basename(root) || root, root };
    const watcher = await this.deps
      .watch(root, (changes) => {
        this.deps.onChanges(ownerId, changes);
      })
      .catch((error: unknown) => {
        // Without a watcher the IDE still works; external changes just
        // are not picked up automatically.
        console.warn('[workspace] could not watch folder', error);
        return null;
      });
    this.open.set(ownerId, { info, watcher });
    return info;
  }

  async close(ownerId: number): Promise<void> {
    const workspace = this.open.get(ownerId);
    this.open.delete(ownerId);
    await workspace?.watcher?.close();
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.open.keys()].map((id) => this.close(id)));
  }
}

/** Puts `root` first in the recent list without duplicates. */
export function addRecent(recent: readonly string[], root: string, limit = 10): string[] {
  return [root, ...recent.filter((entry) => entry !== root)].slice(0, limit);
}
