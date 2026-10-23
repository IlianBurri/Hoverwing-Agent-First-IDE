import { UserError } from '../../ipc/errors';
import type { ModuleHandlers } from '../../ipc/handlers';
import type { WorkspaceManager } from '../workspace';
import type { CheckpointService } from './service';

export function createCheckpointHandlers(
  checkpoints: CheckpointService,
  workspaces: WorkspaceManager,
): ModuleHandlers<'checkpoints'> {
  async function availableRoot(ownerId: number): Promise<string> {
    const root = workspaces.requireRoot(ownerId);
    const status = await checkpoints.status(root);
    if (!status.available) throw new UserError('checkpoints_unavailable', 'Checkpoints need git.');
    return root;
  }

  return {
    'checkpoints:status': (_request, { sender }) =>
      checkpoints.status(workspaces.get(sender.id)?.root ?? null),
    'checkpoints:list': async (_request, { sender }) => {
      const root = workspaces.get(sender.id)?.root;
      if (!root || !(await checkpoints.status(root)).available) return [];
      return checkpoints.repo(root).list();
    },
    'checkpoints:create': async ({ label }, { sender }) => {
      const root = await availableRoot(sender.id);
      const created = await checkpoints.create(root, label, 'manual');
      if (!created) throw new UserError('checkpoints_unavailable', 'Checkpoints need git.');
      return created;
    },
    'checkpoints:changes': async ({ id }, { sender }) =>
      checkpoints.repo(await availableRoot(sender.id)).changesSince(id),
    'checkpoints:fileAt': async ({ id, path }, { sender }) => ({
      content: await checkpoints.repo(await availableRoot(sender.id)).fileAt(id, path),
    }),
    'checkpoints:restore': async ({ id, paths }, { sender }) =>
      checkpoints.restore(await availableRoot(sender.id), id, 'Before restore', paths),
  };
}
