import { isSensitivePath } from '@kestrel/shared';
import type { ChatSummary } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { itemsOf, useChatStore } from '../../stores/chat';
import { useEditorStore } from '../../stores/editor';
import { setPanelOpen } from '../../stores/layout';
import { notify } from '../../stores/toasts';
import { editorSnapshot } from '../editor/snapshot';

const t = i18next.t.bind(i18next);

/** Largest file (in characters) that can be attached. */
const MAX_ATTACHMENT = 100_000;

/** Shows the chat in the right panel. */
export function showChat(): void {
  setPanelOpen('agent', true);
  useChatStore.setState({ mode: 'chat' });
}

export function newChat(): void {
  useChatStore.setState({ chatId: null, items: [], streaming: false, attachment: null });
}

/** Sends a message; false if it was not sent (the text stays in the input). */
export async function sendChat(text: string): Promise<boolean> {
  const { chatId, attachment, items } = useChatStore.getState();
  const id = chatId ?? crypto.randomUUID();
  // Show the message and expect the answer right away; events for this id
  // may arrive before the request returns.
  useChatStore.setState({
    chatId: id,
    streaming: true,
    attachment: null,
    items: [...items, ...itemsOf([{ role: 'user', text, attachment, model: null }])],
  });
  const result = await window.kestrel.invoke('chat:send', { chatId: id, text, attachment });
  if (!result.ok) {
    useChatStore.setState({ chatId, items, attachment, streaming: false });
    notifyError(t('chat.send'), result.error);
    return false;
  }
  return true;
}

export async function stopChat(): Promise<void> {
  await window.kestrel.invoke('chat:stop');
}

export async function listChats(): Promise<ChatSummary[]> {
  const result = await window.kestrel.invoke('chat:list');
  return result.ok ? result.data : [];
}

export async function openChat(id: string): Promise<void> {
  const result = await window.kestrel.invoke('chat:load', { id });
  if (!result.ok) {
    notifyError(t('chat.open'), result.error);
    return;
  }
  useChatStore.setState({
    chatId: result.data.id,
    items: itemsOf(result.data.messages),
    streaming: false,
    attachment: null,
  });
  showChat();
}

/** Attaches the selection (or the whole file) of the active editor. */
export function attachFromEditor(): void {
  const active = useEditorStore.getState().active;
  const snapshot = editorSnapshot();
  if ((active && isSensitivePath(active)) || (snapshot && isSensitivePath(snapshot.path))) {
    notify('warning', t('chat.attachSecret'));
    return;
  }
  if (!snapshot) {
    notify('info', t('chat.attachNoFile'));
    return;
  }
  if (snapshot.text.length > MAX_ATTACHMENT) {
    notify('warning', t('chat.attachTooLarge'));
    return;
  }
  useChatStore.setState({ attachment: snapshot });
  showChat();
}

export function removeAttachment(): void {
  useChatStore.setState({ attachment: null });
}
