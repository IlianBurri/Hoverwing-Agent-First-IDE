import { Hammer, LogIn } from 'lucide-react';
import { i18next } from '../../i18n';
import { useAgentStore } from '../../stores/agent';
import { dockerAvailable, useSandboxStore } from '../../stores/sandbox';
import { registerCommands } from '../commands';
import { openLoginTerminal, prepareSandbox } from './actions';

export function registerSandboxCommands(): () => void {
  const category = () => i18next.t('commands.category.agent');
  const selectedAgent = () => {
    const { configs, selectedAgentId } = useAgentStore.getState();
    return configs.find((config) => config.id === selectedAgentId) ?? null;
  };
  return registerCommands([
    {
      id: 'sandbox.prepare',
      category,
      title: () => i18next.t('sandbox.prepare'),
      icon: Hammer,
      when: () => dockerAvailable() && useSandboxStore.getState().status?.preparing !== true,
      run: async () => {
        await prepareSandbox();
      },
    },
    {
      id: 'sandbox.login',
      category,
      title: () => i18next.t('sandbox.loginCommand', { agent: selectedAgent()?.name ?? '' }),
      icon: LogIn,
      when: () => dockerAvailable() && selectedAgent()?.sandbox.enabled === true,
      run: async () => {
        const agent = selectedAgent();
        if (agent) await openLoginTerminal(agent.id, agent.name);
      },
    },
  ]);
}
