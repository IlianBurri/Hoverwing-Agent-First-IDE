import { CheckCheck, MessageSquare, Undo2, Play, Power, Settings2, Square } from 'lucide-react';
import { i18next } from '../../i18n';
import { useAgentStore } from '../../stores/agent';
import { setPanelOpen } from '../../stores/layout';
import { openModal } from '../../stores/modals';
import { useWorkspaceStore } from '../../stores/workspace';
import { registerCommands } from '../commands';
import { cancelTurn, startAgent, stopAgent } from './actions';
import { focusAgentInput } from './PromptInput';
import { resolveAllChanges } from '../review';
import { useReviewStore } from '../../stores/review';

export function registerAgentCommands(): () => void {
  const category = () => i18next.t('commands.category.agent');
  const state = () => useAgentStore.getState().status.state;
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
      id: 'agent.focus',
      category,
      title: () => i18next.t('agent.focusInput'),
      icon: MessageSquare,
      keybinding: 'Mod+L',
      when: hasWorkspace,
      run: () => {
        setPanelOpen('agent', true);
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
      run: cancelTurn,
    },
    {
      id: 'agent.end',
      category,
      title: () => i18next.t('agent.end'),
      icon: Power,
      when: () => state() === 'ready' || state() === 'working',
      run: stopAgent,
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
