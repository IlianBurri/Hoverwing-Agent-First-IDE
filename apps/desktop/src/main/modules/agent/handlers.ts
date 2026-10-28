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
    'agent:start': ({ slotId, agentId, resumeSessionId }, { sender }) =>
      agents.start(sender.id, slotId, workspaces.requireRoot(sender.id), agentId, resumeSessionId),
    'agent:prompt': async ({ slotId, text }, { sender }) => {
      await agents.prompt(sender.id, slotId, text);
      return null;
    },
    'agent:setOption': ({ slotId, optionId, value }, { sender }) =>
      agents.setOption(sender.id, slotId, workspaces.requireRoot(sender.id), optionId, value),
    'agent:cancel': async ({ slotId }, { sender }) => {
      await agents.cancel(sender.id, slotId);
      return null;
    },
    'agent:stop': async ({ slotId }, { sender }) => {
      await agents.stop(sender.id, slotId);
      return null;
    },
    'agent:close': async ({ slotId }, { sender }) => {
      await agents.close(sender.id, slotId);
      return null;
    },
    'agent:slots': (_request, { sender }) => agents.slotList(sender.id),
    'agent:listSessions': (_request, { sender }) => {
      const root = workspaces.get(sender.id)?.root;
      return root ? agents.listSessions(root) : Promise.resolve([]);
    },
  };
}
