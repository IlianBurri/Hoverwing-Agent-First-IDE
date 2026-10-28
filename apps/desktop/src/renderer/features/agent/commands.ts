import {
  ArrowRightLeft,
  CheckCheck,
  MessageSquare,
  Undo2,
  Play,
  Plus,
  Power,
  Settings2,
  Square,
  X,
} from 'lucide-react';
import { MAX_AGENT_SLOTS } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { activeSlot, addSlot, setActiveSlot, useAgentStore } from '../../stores/agent';
import { useChatStore } from '../../stores/chat';
import { setPanelOpen } from '../../stores/layout';
import { openModal } from '../../stores/modals';
import { useWorkspaceStore } from '../../stores/workspace';
import { registerCommands } from '../commands';
import { cancelTurn, closeAgentTab, startAgent, stopAgent } from './actions';
import { focusAgentInput } from './PromptInput';
import { resolveAllChanges } from '../review';
import { useReviewStore } from '../../stores/review';

export function registerAgentCommands(): () => void {
  const category = () => i18next.t('commands.category.agent');
  const state = () => activeSlot(useAgentStore.getState()).status.state;
  const slots = () => useAgentStore.getState().slots;
  const hasWorkspace = () => useWorkspaceStore.getState().info !== null;
  return registerCommands([
    {
      id: 'agent.start',
      category,
      title: () => i18next.t('agent.startSelected'),
      icon: Play,
      when: () => hasWorkspace() && state() !== 'working' && state() !== 'starting',
      run: () => startAgent(),
    },
    {
      id: 'agent.newTab',
      category,
      title: () => i18next.t('agent.tabs.new'),
      icon: Plus,
      when: () => hasWorkspace() && slots().length < MAX_AGENT_SLOTS,
      run: () => {
        setPanelOpen('agent', true);
        useChatStore.setState({ mode: 'agent' });
        addSlot();
      },
    },
    {
      id: 'agent.nextTab',
      category,
      title: () => i18next.t('agent.tabs.next'),
      icon: ArrowRightLeft,
      when: () => slots().length > 1,
      run: () => {
        const { slots: all, activeSlotId } = useAgentStore.getState();
        const index = all.findIndex((slot) => slot.id === activeSlotId);
        const next = all[(index + 1) % all.length];
        if (next) setActiveSlot(next.id);
      },
    },
    {
      id: 'agent.closeTab',
      category,
      title: () => i18next.t('agent.tabs.closeActive'),
      icon: X,
      when: () => slots().length > 1 || state() !== 'idle',
      run: () => closeAgentTab(),
    },
    {
      id: 'agent.focus',
      category,
      title: () => i18next.t('agent.focusInput'),
      icon: MessageSquare,
      keybinding: 'Mod+L',
      when: hasWorkspace,
      run: () => {
        setPanelOpen('agent', true);
        useChatStore.setState({ mode: 'agent' });
        window.setTimeout(focusAgentInput, 0);
      },
    },
    {
      id: 'agent.cancel',
      category,
      title: () => i18next.t('agent.stop'),
      icon: Square,
      keybinding: 'Mod+Shift+Escape',
      when: () => state() === 'working',
      run: () => cancelTurn(),
    },
    {
      id: 'agent.end',
      category,
      title: () => i18next.t('agent.end'),
      icon: Power,
      when: () => state() === 'ready' || state() === 'working',
      run: () => stopAgent(),
    },
    {
      id: 'review.acceptAll',
      category,
      title: () => i18next.t('review.acceptAll'),
      icon: CheckCheck,
      when: () => useReviewStore.getState().files.length > 0,
      run: () => resolveAllChanges('all'),
    },
    {
      id: 'review.rejectAll',
      category,
      title: () => i18next.t('review.rejectAll'),
      icon: Undo2,
      when: () => useReviewStore.getState().files.length > 0,
      run: () => resolveAllChanges('none'),
    },
    {
      id: 'agent.manage',
      category,
      title: () => i18next.t('agent.manage'),
      icon: Settings2,
      run: () => {
        openModal({ id: 'agents' });
      },
    },
  ]);
}
