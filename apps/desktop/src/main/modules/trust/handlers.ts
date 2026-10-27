import type { ModuleHandlers } from '../../ipc/handlers';
import type { WorkspaceManager } from '../workspace';
import type { TrustStore } from './store';

export function createTrustHandlers(
  store: TrustStore,
  workspaces: WorkspaceManager,
  /** Native confirm in main: the renderer can only ask for the dialog. */
  confirmTrust: (ownerId: number, root: string) => Promise<boolean>,
): ModuleHandlers<'trust'> {
  const state = async (ownerId: number) => {
    const root = workspaces.get(ownerId)?.root;
    return { trusted: root === undefined ? null : await store.isTrusted(root) };
  };
  return {
    'trust:get': (_request, { sender }) => state(sender.id),
    'trust:grant': async (_request, { sender }) => {
      const root = workspaces.requireRoot(sender.id);
      if (!(await store.isTrusted(root)) && (await confirmTrust(sender.id, root))) {
        await store.set(root, true);
      }
      return state(sender.id);
    },
    'trust:revoke': async (_request, { sender }) => {
      await store.set(workspaces.requireRoot(sender.id), false);
      return state(sender.id);
    },
  };
}
