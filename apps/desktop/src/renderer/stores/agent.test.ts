import { describe, expect, it } from 'vitest';
import { MAX_AGENT_SLOTS, idleAgentStatus } from '@kestrel/shared';
import {
  activeSlot,
  addSlot,
  appendLog,
  applyEvent,
  reduceEvent,
  removeSlot,
  setSlotStatus,
  useAgentStore,
} from './agent';
import type { TranscriptItem } from './agent';

const toolCall = {
  id: 't1',
  title: 'Edit a.ts',
  kind: 'edit' as const,
  status: 'pending' as const,
  locations: [],
  diffs: [],
  output: '',
};

describe('reduceEvent', () => {
  it('joins streamed chunks of the agent into one message', () => {
    let items: readonly TranscriptItem[] = [];
    items = reduceEvent(items, { type: 'message', role: 'user', text: 'Hi' });
    items = reduceEvent(items, { type: 'message', role: 'agent', text: 'Hel' });
    items = reduceEvent(items, { type: 'message', role: 'agent', text: 'lo' });
    expect(
      items.map((item) => (item.kind === 'message' ? `${item.role}:${item.text}` : item.kind)),
    ).toEqual(['user:Hi', 'agent:Hello']);
  });

  it('updates tool calls in place', () => {
    let items = reduceEvent([], { type: 'toolCall', toolCall });
    items = reduceEvent(items, { type: 'message', role: 'agent', text: 'working' });
    items = reduceEvent(items, {
      type: 'toolCall',
      toolCall: { ...toolCall, status: 'completed' },
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'toolCall', toolCall: { status: 'completed' } });
  });

  it('adds a notice when a turn did not end normally', () => {
    expect(reduceEvent([], { type: 'turnEnded', stopReason: 'end_turn' })).toEqual([]);
    expect(reduceEvent([], { type: 'turnEnded', stopReason: 'cancelled' })[0]).toMatchObject({
      kind: 'notice',
      text: 'cancelled',
    });
  });
});

describe('agent slots', () => {
  const ready = (sessionId: string, agentName: string) => ({
    ...idleAgentStatus,
    state: 'ready' as const,
    sessionId,
    agentName,
  });

  it('keeps separate transcripts per tab and never closes the last tab', () => {
    const first = useAgentStore.getState().activeSlotId;
    setSlotStatus(first, ready('s1', 'Alpha'));
    const second = addSlot();
    expect(second).not.toBeNull();
    if (!second) return;
    setSlotStatus(second, ready('s2', 'Beta'));
    applyEvent(first, 's1', { type: 'message', role: 'agent', text: 'from alpha' });
    applyEvent(second, 's2', { type: 'message', role: 'agent', text: 'from beta' });
    // An event of another session does not leak into a tab.
    applyEvent(second, 's1', { type: 'message', role: 'agent', text: 'stray' });

    const texts = (id: string) =>
      useAgentStore
        .getState()
        .slots.find((slot) => slot.id === id)
        ?.items.map((item) => (item.kind === 'message' ? item.text : item.kind));
    expect(texts(first)).toEqual(['from alpha']);
    expect(texts(second)).toEqual(['from beta']);
    expect(useAgentStore.getState().activeSlotId).toBe(second);

    removeSlot(second);
    expect(useAgentStore.getState().activeSlotId).toBe(first);
    removeSlot(first);
    expect(useAgentStore.getState().slots).toHaveLength(1);
    expect(activeSlot(useAgentStore.getState()).status.state).toBe('idle');
  });

  it(`opens at most ${String(MAX_AGENT_SLOTS)} tabs`, () => {
    while (useAgentStore.getState().slots.length < MAX_AGENT_SLOTS) addSlot();
    expect(addSlot()).toBeNull();
  });

  it('prefixes log lines with the agent name', () => {
    const slot = activeSlot(useAgentStore.getState());
    setSlotStatus(slot.id, ready('s9', 'Gamma'));
    appendLog({ slotId: slot.id, line: 'booting', time: 1 });
    expect(useAgentStore.getState().log.at(-1)?.line).toBe('Gamma │ booting');
  });
});
