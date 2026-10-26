import { MessageCirclePlus, MessagesSquare, Paperclip, Square } from 'lucide-react';
import { i18next } from '../../i18n';
import { useChatStore } from '../../stores/chat';
import { useEditorStore } from '../../stores/editor';
import { registerCommands } from '../commands';
import { attachFromEditor, newChat, showChat, stopChat } from './actions';
import { focusChatInput } from './ChatView';

export function registerChatCommands(): () => void {
  const category = () => i18next.t('commands.category.chat');
  return registerCommands([
    {
      id: 'chat.show',
      category,
      title: () => i18next.t('chat.show'),
      icon: MessagesSquare,
      run: () => {
        showChat();
        window.setTimeout(focusChatInput, 0);
      },
    },
    {
      id: 'chat.new',
      category,
      title: () => i18next.t('chat.new'),
      icon: MessageCirclePlus,
      when: () => !useChatStore.getState().streaming,
      run: () => {
        newChat();
        showChat();
        window.setTimeout(focusChatInput, 0);
      },
    },
    {
      id: 'chat.attach',
      category,
      title: () => i18next.t('chat.attach'),
      icon: Paperclip,
      when: () => useEditorStore.getState().active !== null,
      run: () => {
        attachFromEditor();
        window.setTimeout(focusChatInput, 0);
      },
    },
    {
      id: 'chat.stop',
      category,
      title: () => i18next.t('chat.stop'),
      icon: Square,
      when: () => useChatStore.getState().streaming,
      run: stopChat,
    },
  ]);
}
