import type { ModuleHandlers } from '../../ipc/handlers';
import type { WorkspaceManager } from '../workspace';
import type { ReviewService } from './service';

export function createReviewHandlers(
  review: ReviewService,
  workspaces: WorkspaceManager,
): ModuleHandlers<'review'> {
  const root = (ownerId: number) => workspaces.requireRoot(ownerId);
  return {
    'review:list': (_request, { sender }) => {
      const workspace = workspaces.get(sender.id);
      return workspace ? review.list(workspace.root) : [];
    },
    'review:diff': ({ path }, { sender }) => review.diff(root(sender.id), path),
    'review:resolve': async ({ path, keep }, { sender }) => {
      await review.resolve(root(sender.id), path, keep);
      return null;
    },
    'review:resolveAll': ({ keep }, { sender }) => review.resolveAll(root(sender.id), keep),
  };
}
