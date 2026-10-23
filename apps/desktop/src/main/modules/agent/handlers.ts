import type { ModuleHandlers } from '../../ipc/handlers';
import type { WorkspaceManager } from '../workspace';
import type { AgentService } from './service';

export function createAgentHandlers(
  agents: AgentService,
  workspaces: WorkspaceManager,
): ModuleHandlers<'agent'> {
  return {
    'agent:listConfigs': () => agents.listConfigs(),
    'agent:saveConfig': (config) => agents.saveConfig(config),
    'agent:deleteConfig': async ({ id }) => {
      await agents.deleteConfig(id);
      return null;
    },
    'agent:setEnv': async ({ agentId, name, value }) => {
      await agents.setEnv(agentId, name, value);
      return null;
    },
    'agent:start': ({ agentId, resumeSessionId }, { sender }) =>
      agents.start(sender.id, workspaces.requireRoot(sender.id), agentId, resumeSessionId),
    'agent:prompt': async ({ text }, { sender }) => {
      await agents.prompt(sender.id, text);
      return null;
    },
    'agent:cancel': async (_request, { sender }) => {
      await agents.cancel(sender.id);
      return null;
    },
    'agent:stop': async (_request, { sender }) => {
      await agents.stop(sender.id);
      return null;
    },
    'agent:status': (_request, { sender }) => agents.status(sender.id),
    'agent:listSessions': (_request, { sender }) => {
      const root = workspaces.get(sender.id)?.root;
      return root ? agents.listSessions(root) : Promise.resolve([]);
    },
  };
}
