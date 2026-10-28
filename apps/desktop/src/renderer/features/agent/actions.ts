import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { activeSlot, removeSlot, setSlotStatus, useAgentStore } from '../../stores/agent';
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

const activeSlotId = () => activeSlot(useAgentStore.getState()).id;

/** Starts the selected agent in a tab (default: the active one). */
export async function startAgent(
  resumeSessionId?: string,
  slotId: string = activeSlotId(),
): Promise<void> {
  const { selectedAgentId } = useAgentStore.getState();
  if (!selectedAgentId) return;
  setPanelOpen('agent', true);
  const result = await window.kestrel.invoke('agent:start', {
    slotId,
    agentId: selectedAgentId,
    ...(resumeSessionId ? { resumeSessionId } : {}),
  });
  if (result.ok) setSlotStatus(slotId, result.data);
  else if (result.error.code !== 'agent_not_approved') notifyError(t('agent.start'), result.error);
}

export async function sendPrompt(text: string, slotId: string = activeSlotId()): Promise<boolean> {
  const result = await window.kestrel.invoke('agent:prompt', { slotId, text });
  if (!result.ok) notifyError(t('agent.send'), result.error);
  return result.ok;
}

export async function cancelTurn(slotId: string = activeSlotId()): Promise<void> {
  await window.kestrel.invoke('agent:cancel', { slotId });
}

export async function stopAgent(slotId: string = activeSlotId()): Promise<void> {
  await window.kestrel.invoke('agent:stop', { slotId });
}

/** Ends the tab's agent (if any) and closes the tab. */
export async function closeAgentTab(slotId: string = activeSlotId()): Promise<void> {
  await window.kestrel.invoke('agent:close', { slotId });
  removeSlot(slotId);
}
