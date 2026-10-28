import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, Cpu, Paperclip, SlidersHorizontal, Square, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isFreeModel } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { useChatStore } from '../../stores/chat';
import { openModal } from '../../stores/modals';
import { useProvidersStore } from '../../stores/providers';
import { useSettingsStore } from '../../stores/settings';
import { ModelSelect, setChatModel, showModelsView } from '../providers';
import { attachFromEditor, removeAttachment, sendChat, stopChat } from './actions';
import { AttachmentLabel, ChatTranscript } from './ChatTranscript';
import { ModelOptions } from './ModelOptions';
import styles from './ChatView.module.css';

/** Request to focus the chat input (e.g. from a command). */
let focusInput: (() => void) | null = null;
export function focusChatInput(): void {
  focusInput?.();
}

function ChatInput() {
  const { t } = useTranslation();
  const id = useId();
  const { streaming, attachment } = useChatStore();
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    focusInput = () => ref.current?.focus();
    return () => {
      focusInput = null;
    };
  }, []);

  async function submit() {
    const value = text.trim();
    if (!value || streaming) return;
    setText('');
    if (!(await sendChat(value))) setText(value);
  }

  return (
    <form
      className={styles['input']}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {attachment && (
        <div className={styles['chip']}>
          <AttachmentLabel attachment={attachment} />
          <IconButton
            size="sm"
            icon={X}
            label={t('chat.removeAttachment')}
            onClick={removeAttachment}
          />
        </div>
      )}
      <label htmlFor={id} className="visually-hidden">
        {t('chat.inputLabel')}
      </label>
      <textarea
        ref={ref}
        id={id}
        className={styles['textarea']}
        rows={3}
        value={text}
        placeholder={t('chat.inputPlaceholder')}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
          }
          if (event.key === 'Escape' && streaming) {
            event.preventDefault();
            void stopChat();
          }
        }}
      />
      <div className={styles['actions']}>
        <IconButton
          size="sm"
          icon={Paperclip}
          label={t('chat.attach')}
          onClick={attachFromEditor}
        />
        <span className={styles['hint']}>{t('agent.inputHint')}</span>
        {streaming ? (
          <IconButton
            icon={Square}
            label={t('chat.stop')}
            className={styles['stop']}
            onClick={() => void stopChat()}
          />
        ) : (
          <IconButton
            icon={ArrowUp}
            label={t('chat.send')}
            className={styles['send']}
            disabled={text.trim() === ''}
            type="submit"
          />
        )}
      </div>
    </form>
  );
}

/** The built-in chat: a model of the user's provider, without tools. */
export function ChatView() {
  const { t } = useTranslation();
  const providers = useProvidersStore((state) => state.providers);
  const chatModel = useSettingsStore((state) => state.settings.chatModel);
  const { items, streaming } = useChatStore();
  const [showOptions, setShowOptions] = useState(false);

  if (providers.length === 0) {
    return (
      <EmptyState
        icon={Cpu}
        title={t('chat.noProviderTitle')}
        description={t('chat.noProviderText')}
      >
        <Button
          variant="primary"
          onClick={() => {
            openModal({ id: 'provider', provider: null });
          }}
        >
          {t('providers.add')}
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className={styles['root']}>
      <div className={styles['bar']}>
        <ModelSelect
          label={t('chat.model')}
          value={chatModel}
          noneLabel={t('chat.chooseModel')}
          onChange={(ref) => void setChatModel(ref)}
        />
        <IconButton
          size="sm"
          icon={SlidersHorizontal}
          label={t('chat.options.toggle')}
          pressed={showOptions}
          disabled={!chatModel}
          onClick={() => {
            setShowOptions((shown) => !shown);
          }}
        />
        <Button variant="ghost" onClick={showModelsView}>
          {t('chat.manageModels')}
        </Button>
      </div>
      {showOptions && chatModel && (
        <ModelOptions key={`${chatModel.providerId}/${chatModel.model}`} model={chatModel} />
      )}
      {chatModel && isFreeModel(chatModel.model) && (
        <div className={styles['note']}>
          <StatusMessage kind="warning">{t('providers.freeShort')}</StatusMessage>
        </div>
      )}
      <ChatTranscript items={items} streaming={streaming} />
      <ChatInput />
      <p className={styles['privacy']}>{t('chat.privacyNote')}</p>
    </div>
  );
}
