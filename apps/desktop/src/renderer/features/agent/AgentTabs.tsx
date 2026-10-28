import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Circle, CircleAlert, CircleCheck, Hand, LoaderCircle, Plus, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MAX_AGENT_SLOTS } from '@kestrel/shared';
import type { PermissionRequest } from '@kestrel/shared';
import { IconButton } from '../../components/IconButton';
import { addSlot, setActiveSlot, useAgentStore } from '../../stores/agent';
import type { AgentSlotState } from '../../stores/agent';
import { usePermissionStore } from '../../stores/permissions';
import { closeAgentTab } from './actions';
import styles from './AgentTabs.module.css';

export const AGENT_TAB_PANEL_ID = 'agent-tab-panel';

type Tone = 'working' | 'waiting' | 'ready' | 'error' | 'idle';

/** Tab state as icon + text + color (never color alone). */
function tabState(slot: AgentSlotState, waiting: boolean): { tone: Tone; icon: LucideIcon } {
  if (waiting) return { tone: 'waiting', icon: Hand };
  switch (slot.status.state) {
    case 'working':
    case 'starting':
      return { tone: 'working', icon: LoaderCircle };
    case 'ready':
      return { tone: 'ready', icon: CircleCheck };
    case 'error':
      return { tone: 'error', icon: CircleAlert };
    default:
      return { tone: 'idle', icon: Circle };
  }
}

/** Whether a permission question belongs to the agent of this tab. */
export function isForSlot(
  request: PermissionRequest,
  slot: AgentSlotState,
  slots: readonly AgentSlotState[],
  active: boolean,
): boolean {
  if (request.slotId === slot.id) return true;
  // Questions no tab can claim show in the active tab.
  return active && !slots.some((other) => other.id === request.slotId);
}

/** One tab per parallel agent, with its state, plus "new agent". */
export function AgentTabs() {
  const { t } = useTranslation();
  const slots = useAgentStore((state) => state.slots);
  const activeSlotId = useAgentStore((state) => state.activeSlotId);
  const pending = usePermissionStore((state) => state.pending);
  const listRef = useRef<HTMLDivElement>(null);

  function focusTab(index: number) {
    const slot = slots[(index + slots.length) % slots.length];
    if (!slot) return;
    setActiveSlot(slot.id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-slot="${slot.id}"]`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    const index = slots.findIndex((slot) => slot.id === activeSlotId);
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: slots.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    focusTab(target);
  }

  return (
    <div className={styles['root']}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={t('agent.tabs.label')}
        className={styles['list']}
        onKeyDown={onKeyDown}
      >
        {slots.map((slot, index) => {
          const selected = slot.id === activeSlotId;
          const waiting = pending.some((request) => isForSlot(request, slot, slots, selected));
          const { tone, icon: Icon } = tabState(slot, waiting);
          const name = slot.status.agentName ?? t('agent.tabs.untitled', { number: index + 1 });
          const stateText = waiting
            ? t('agent.tabs.waiting')
            : t(`status.agentState.${slot.status.state}`);
          return (
            <div key={slot.id} className={styles['item']} data-selected={selected}>
              <button
                type="button"
                role="tab"
                data-slot={slot.id}
                aria-selected={selected}
                aria-controls={AGENT_TAB_PANEL_ID}
                tabIndex={selected ? 0 : -1}
                className={styles['tab']}
                title={`${name} · ${stateText}`}
                onClick={() => {
                  setActiveSlot(slot.id);
                }}
              >
                <Icon size={12} aria-hidden="true" className={styles[tone]} />
                <span className={styles['name']}>{name}</span>
                <span className="visually-hidden">{` · ${stateText}`}</span>
              </button>
              {(slots.length > 1 || slot.status.state !== 'idle') && (
                <IconButton
                  size="sm"
                  icon={X}
                  label={t('agent.tabs.close', { name })}
                  onClick={() => void closeAgentTab(slot.id)}
                />
              )}
            </div>
          );
        })}
      </div>
      <IconButton
        size="sm"
        icon={Plus}
        label={t('agent.tabs.new')}
        disabled={slots.length >= MAX_AGENT_SLOTS}
        onClick={() => {
          addSlot();
        }}
      />
    </div>
  );
}
