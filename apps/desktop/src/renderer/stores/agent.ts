import { create } from 'zustand';
import { idleAgentStatus } from '@kestrel/shared';
import type {
  AgentConfigView,
  AgentEvent,
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

interface AgentState {
  status: AgentStatus;
  configs: readonly AgentConfigView[];
  selectedAgentId: string | null;
  items: readonly TranscriptItem[];
  plan: readonly PlanEntry[];
  log: readonly LogLine[];
}

export const useAgentStore = create<AgentState>()(() => ({
  status: idleAgentStatus,
  configs: [],
  selectedAgentId: null,
  items: [],
  plan: [],
  log: [],
}));

let nextId = 1;
const MAX_LOG_LINES = 1000;

export function setStatus(status: AgentStatus): void {
  useAgentStore.setState((state) => {
    // A different session starts with an empty transcript.
    const newSession = status.sessionId !== null && status.sessionId !== state.status.sessionId;
    return newSession ? { status, items: [], plan: [] } : { status };
  });
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

export function applyEvent(sessionId: string, event: AgentEvent): void {
  useAgentStore.setState((state) => {
    if (state.status.sessionId !== null && state.status.sessionId !== sessionId) return state;
    if (event.type === 'plan') return { plan: event.entries };
    return { items: reduceEvent(state.items, event) };
  });
}

export function appendLog(line: LogLine): void {
  useAgentStore.setState((state) => ({ log: [...state.log, line].slice(-MAX_LOG_LINES) }));
}
