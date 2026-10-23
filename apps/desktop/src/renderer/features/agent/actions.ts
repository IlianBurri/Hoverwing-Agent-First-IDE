import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { setStatus, useAgentStore } from '../../stores/agent';
import { setPanelOpen } from '../../stores/layout';

const t = i18next.t.bind(i18next);

export async function loadAgentConfigs(): Promise<void> {
  const result = await window.kestrel.invoke('agent:listConfigs');
  if (!result.ok) return;
  useAgentStore.setState((state) => ({
    configs: result.data,
    selectedAgentId:
      state.selectedAgentId && result.data.some((config) => config.id === state.selectedAgentId)
        ? state.selectedAgentId
        : (result.data[0]?.id ?? null),
  }));
}

export async function startAgent(resumeSessionId?: string): Promise<void> {
  const { selectedAgentId } = useAgentStore.getState();
  if (!selectedAgentId) return;
  setPanelOpen('agent', true);
  const result = await window.kestrel.invoke('agent:start', {
    agentId: selectedAgentId,
    ...(resumeSessionId ? { resumeSessionId } : {}),
  });
  if (result.ok) setStatus(result.data);
  else if (result.error.code !== 'agent_not_approved') notifyError(t('agent.start'), result.error);
}

export async function sendPrompt(text: string): Promise<boolean> {
  const result = await window.kestrel.invoke('agent:prompt', { text });
  if (!result.ok) notifyError(t('agent.send'), result.error);
  return result.ok;
}

export async function cancelTurn(): Promise<void> {
  await window.kestrel.invoke('agent:cancel');
}

export async function stopAgent(): Promise<void> {
  await window.kestrel.invoke('agent:stop');
}
