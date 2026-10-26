import type { ModuleHandlers } from '../../ipc/handlers';
import type { WorkspaceManager } from '../workspace';
import type { McpService } from './service';

export function createMcpHandlers(
  mcp: McpService,
  workspaces: WorkspaceManager,
): ModuleHandlers<'mcp'> {
  const root = (ownerId: number) => workspaces.get(ownerId)?.root ?? null;
  return {
    'mcp:list': (_request, { sender }) => mcp.list(root(sender.id)),
    'mcp:save': (config, { sender }) => mcp.save(sender.id, root(sender.id), config),
    'mcp:delete': async ({ id, scope }, { sender }) => {
      await mcp.delete(root(sender.id), scope, id);
      return null;
    },
    'mcp:setSecret': async ({ id, scope, name, value }, { sender }) => {
      await mcp.setSecret(root(sender.id), scope, id, name, value);
      return null;
    },
    'mcp:test': ({ id, scope }, { sender }) => mcp.test(root(sender.id), scope, id),
    'mcp:setToolEnabled': async ({ id, scope, tool, enabled }, { sender }) => {
      await mcp.setToolEnabled(root(sender.id), scope, id, tool, enabled);
      return null;
    },
    'mcp:setToolLevel': async ({ id, scope, tool, level }, { sender }) => {
      await mcp.setToolLevel(root(sender.id), scope, id, tool, level);
      return null;
    },
    'mcp:previewImport': (_request, { sender }) =>
      mcp.previewImport(workspaces.requireRoot(sender.id)),
    'mcp:import': async ({ ids }, { sender }) => ({
      imported: await mcp.import(sender.id, workspaces.requireRoot(sender.id), ids),
    }),
  };
}
