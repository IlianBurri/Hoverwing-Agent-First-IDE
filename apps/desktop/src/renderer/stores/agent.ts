import { create } from 'zustand';
import { MAX_AGENT_SLOTS, idleAgentStatus } from '@kestrel/shared';
import type {
  AgentConfigView,
  AgentEvent,
  AgentSlot,
  AgentStatus,
  PlanEntry,
  ToolCallView,
} from '@kestrel/shared';

export type TranscriptItem =
  | { kind: 'message'; id: number; role: 'user' | 'agent' | 'thought'; text: string }
  | { kind: 'toolCall'; id: number; toolCall: ToolCallView }
  | { kind: 'turn'; id: number; checkpointId: string | null }
  | { kind: 'notice'; id: number; text: string; tone: 'info' | 'warning' | 'error' };

export interface LogLine {
  time: number;
  line: string;
}

/** One agent tab: an agent running (or ready to start) in parallel to others. */
export interface AgentSlotState {
  id: string;
  status: AgentStatus;
  items: readonly TranscriptItem[];
  plan: readonly PlanEntry[];
}

interface AgentState {
  /** In tab order; never empty. */
  slots: readonly AgentSlotState[];
  activeSlotId: string;
  configs: readonly AgentConfigView[];
  selectedAgentId: string | null;
  /** Diagnostic output of all agents, each line prefixed with the agent's name. */
  log: readonly LogLine[];
}

let nextId = 1;
let nextSlot = 1;
const MAX_LOG_LINES = 1000;

/** Slot ids are chosen here, so events can never arrive for an unknown slot. */
function newSlot(): AgentSlotState {
  const id = `slot-${String(nextSlot++)}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, status: idleAgentStatus, items: [], plan: [] };
}

const firstSlot = newSlot();

export const useAgentStore = create<AgentState>()(() => ({
  slots: [firstSlot],
  activeSlotId: firstSlot.id,
  configs: [],
  selectedAgentId: null,
  log: [],
}));

export function activeSlot(state: AgentState): AgentSlotState {
  return (
    state.slots.find((slot) => slot.id === state.activeSlotId) ?? (state.slots[0] as AgentSlotState)
  );
}

/** The tab the user is looking at. */
export function useActiveSlot(): AgentSlotState {
  return useAgentStore(activeSlot);
}

/** Running = started and not ended (also while starting). */
export function isRunning(status: AgentStatus): boolean {
  return status.state === 'starting' || status.state === 'ready' || status.state === 'working';
}

function updateSlot(
  slotId: string,
  update: (slot: AgentSlotState) => AgentSlotState,
  createMissing = false,
): void {
  useAgentStore.setState((state) => {
    const exists = state.slots.some((slot) => slot.id === slotId);
    if (!exists) {
      if (!createMissing) return state;
      // A slot main knows (e.g. after a reload): becomes a tab again.
      const slot = update({ id: slotId, status: idleAgentStatus, items: [], plan: [] });
      const fresh = state.slots.length === 1 && state.slots[0]?.status.state === 'idle';
      return fresh ? { slots: [slot], activeSlotId: slot.id } : { slots: [...state.slots, slot] };
    }
    return { slots: state.slots.map((slot) => (slot.id === slotId ? update(slot) : slot)) };
  });
}

export function setSlotStatus(slotId: string, status: AgentStatus): void {
  updateSlot(
    slotId,
    (slot) => {
      // A different session starts with an empty transcript.
      const newSession = status.sessionId !== null && status.sessionId !== slot.status.sessionId;
      return newSession ? { ...slot, status, items: [], plan: [] } : { ...slot, status };
    },
    true,
  );
}

export function loadSlots(slots: readonly AgentSlot[]): void {
  for (const slot of slots) setSlotStatus(slot.slotId, slot.status);
}

/** Opens a new, empty agent tab (null when the limit is reached). */
export function addSlot(): string | null {
  const { slots } = useAgentStore.getState();
  if (slots.length >= MAX_AGENT_SLOTS) return null;
  const slot = newSlot();
  useAgentStore.setState({ slots: [...slots, slot], activeSlotId: slot.id });
  return slot.id;
}

/** Removes a tab; the last tab is replaced by an empty one. */
export function removeSlot(slotId: string): void {
  useAgentStore.setState((state) => {
    const index = state.slots.findIndex((slot) => slot.id === slotId);
    if (index === -1) return state;
    const rest = state.slots.filter((slot) => slot.id !== slotId);
    const slots = rest.length > 0 ? rest : [newSlot()];
    const activeSlotId =
      state.activeSlotId === slotId
        ? (slots[Math.min(index, slots.length - 1)] as AgentSlotState).id
        : state.activeSlotId;
    return { slots, activeSlotId };
  });
}

export function setActiveSlot(slotId: string): void {
  useAgentStore.setState((state) =>
    state.slots.some((slot) => slot.id === slotId) ? { activeSlotId: slotId } : state,
  );
}

/** Applies one agent event to the transcript. */
export function reduceEvent(
  items: readonly TranscriptItem[],
  event: AgentEvent,
): readonly TranscriptItem[] {
  switch (event.type) {
    case 'message': {
      const last = items.at(-1);
      // Streamed chunks of the same speaker form one message.
      if (last?.kind === 'message' && last.role === event.role && event.role !== 'user') {
        return [...items.slice(0, -1), { ...last, text: last.text + event.text }];
      }
      return [...items, { kind: 'message', id: nextId++, role: event.role, text: event.text }];
    }
    case 'toolCall': {
      const index = items.findIndex(
        (item) => item.kind === 'toolCall' && item.toolCall.id === event.toolCall.id,
      );
      if (index === -1)
        return [...items, { kind: 'toolCall', id: nextId++, toolCall: event.toolCall }];
      const existing = items[index];
      if (existing?.kind !== 'toolCall') return items;
      return [
        ...items.slice(0, index),
        { ...existing, toolCall: event.toolCall },
        ...items.slice(index + 1),
      ];
    }
    case 'turnStarted':
      return [...items, { kind: 'turn', id: nextId++, checkpointId: event.checkpointId }];
    case 'turnEnded':
      if (event.stopReason === 'end_turn') return items;
      return [
        ...items,
        {
          kind: 'notice',
          id: nextId++,
          text: event.stopReason,
          tone: event.stopReason === 'cancelled' ? 'info' : 'warning',
        },
      ];
    case 'notice':
      return [...items, { kind: 'notice', id: nextId++, text: event.text, tone: 'error' }];
    case 'plan':
      return items;
  }
}

export function applyEvent(slotId: string, sessionId: string, event: AgentEvent): void {
  updateSlot(slotId, (slot) => {
    if (slot.status.sessionId !== null && slot.status.sessionId !== sessionId) return slot;
    if (event.type === 'plan') return { ...slot, plan: event.entries };
    return { ...slot, items: reduceEvent(slot.items, event) };
  });
}

export function appendLog(entry: { slotId: string; line: string; time: number }): void {
  useAgentStore.setState((state) => {
    const name = state.slots.find((slot) => slot.id === entry.slotId)?.status.agentName;
    const line = name ? `${name} │ ${entry.line}` : entry.line;
    return { log: [...state.log, { time: entry.time, line }].slice(-MAX_LOG_LINES) };
  });
}
