import { create } from 'zustand';
import type { ChatAttachment, ChatEvent, ChatMessage, ModelError } from '@kestrel/shared';

export type ChatItem =
  | { kind: 'message'; id: number; message: ChatMessage }
  | { kind: 'fallback'; id: number; from: string; to: string; error: ModelError }
  | { kind: 'error'; id: number; error: ModelError }
  | { kind: 'stopped'; id: number };

interface ChatState {
  /** What the right panel shows: the ACP agent or the built-in chat. */
  mode: 'agent' | 'chat';
  chatId: string | null;
  items: readonly ChatItem[];
  streaming: boolean;
  /** Attached to the next message. */
  attachment: ChatAttachment | null;
}

export const useChatStore = create<ChatState>()(() => ({
  mode: 'agent',
  chatId: null,
  items: [],
  streaming: false,
  attachment: null,
}));

let nextId = 1;

export function itemsOf(messages: readonly ChatMessage[]): ChatItem[] {
  return messages.map((message) => ({ kind: 'message', id: nextId++, message }));
}

/** Applies one streaming event to the chat items. */
export function reduceChatEvent(items: readonly ChatItem[], event: ChatEvent): readonly ChatItem[] {
  switch (event.type) {
    case 'started':
      return [
        ...items,
        {
          kind: 'message',
          id: nextId++,
          message: { role: 'assistant', text: '', attachment: null, model: event.model },
        },
      ];
    case 'delta': {
      const last = items.at(-1);
      if (last?.kind !== 'message' || last.message.role !== 'assistant') return items;
      return [
        ...items.slice(0, -1),
        { ...last, message: { ...last.message, text: last.message.text + event.text } },
      ];
    }
    case 'fallback':
    case 'error': {
      // The empty answer of the failed model goes away.
      const last = items.at(-1);
      const kept =
        last?.kind === 'message' && last.message.role === 'assistant' && last.message.text === ''
          ? items.slice(0, -1)
          : items;
      return event.type === 'fallback'
        ? [
            ...kept,
            { kind: 'fallback', id: nextId++, from: event.from, to: event.to, error: event.error },
          ]
        : [...kept, { kind: 'error', id: nextId++, error: event.error }];
    }
    case 'done':
      return event.stopped ? [...items, { kind: 'stopped', id: nextId++ }] : items;
  }
}

export function applyChatEvent(chatId: string, event: ChatEvent): void {
  useChatStore.setState((state) => {
    if (state.chatId !== chatId) return state;
    return {
      items: reduceChatEvent(state.items, event),
      streaming: event.type !== 'done' && event.type !== 'error',
    };
  });
}
