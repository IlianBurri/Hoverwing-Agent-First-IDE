import { describe, expect, it } from 'vitest';
import { reduceEvent } from './agent';
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
