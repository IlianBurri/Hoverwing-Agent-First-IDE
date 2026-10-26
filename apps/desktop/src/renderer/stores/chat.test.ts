import { describe, expect, it } from 'vitest';
import type { ChatItem } from './chat';
import { reduceChatEvent } from './chat';

const texts = (items: readonly ChatItem[]) =>
  items.map((item) => (item.kind === 'message' ? item.message.text : item.kind));

describe('reduceChatEvent', () => {
  it('collects streamed text into one answer with its model', () => {
    let items = reduceChatEvent([], { type: 'started', model: 'm1' });
    items = reduceChatEvent(items, { type: 'delta', text: 'Hel' });
    items = reduceChatEvent(items, { type: 'delta', text: 'lo' });
    items = reduceChatEvent(items, { type: 'done', stopped: false });
    expect(texts(items)).toEqual(['Hello']);
    expect(items[0]?.kind === 'message' && items[0].message.model).toBe('m1');
  });

  it('replaces the empty answer of a failed model with a fallback notice', () => {
    let items = reduceChatEvent([], { type: 'started', model: 'a' });
    items = reduceChatEvent(items, {
      type: 'fallback',
      from: 'a',
      to: 'b',
      error: { kind: 'rateLimited', retryAfter: null },
    });
    items = reduceChatEvent(items, { type: 'started', model: 'b' });
    items = reduceChatEvent(items, { type: 'delta', text: 'ok' });
    expect(texts(items)).toEqual(['fallback', 'ok']);
  });

  it('keeps partial text and marks a stop', () => {
    let items = reduceChatEvent([], { type: 'started', model: 'a' });
    items = reduceChatEvent(items, { type: 'delta', text: 'part' });
    items = reduceChatEvent(items, { type: 'done', stopped: true });
    expect(texts(items)).toEqual(['part', 'stopped']);
  });
});
