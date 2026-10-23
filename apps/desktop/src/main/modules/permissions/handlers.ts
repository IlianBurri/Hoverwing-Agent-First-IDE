import type { ModuleHandlers } from '../../ipc/handlers';
import type { WorkspaceManager } from '../workspace';
import type { PermissionService } from './service';

export function createPermissionHandlers(
  permissions: PermissionService,
  workspaces: WorkspaceManager,
): ModuleHandlers<'permissions'> {
  const root = (ownerId: number) => workspaces.get(ownerId)?.root ?? null;
  return {
    'permissions:respond': async ({ requestId, decision }, { sender }) => {
      await permissions.respond(sender.id, requestId, decision);
      return null;
    },
    'permissions:pending': (_request, { sender }) => permissions.pendingFor(sender.id),
    'permissions:listRules': (_request, { sender }) => permissions.listRules(root(sender.id)),
    'permissions:addRule': (rule, { sender }) => permissions.addRule(root(sender.id), rule),
    'permissions:deleteRule': async ({ id }, { sender }) => {
      await permissions.deleteRule(root(sender.id), id);
      return null;
    },
    'permissions:log': ({ limit }, { sender }) => permissions.readLog(root(sender.id), limit),
  };
}
