import { useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatAttachment } from '@kestrel/shared';
import { Markdown } from '../../components/Markdown';
import { StatusMessage } from '../../components/StatusMessage';
import type { ChatItem } from '../../stores/chat';
import styles from './ChatTranscript.module.css';

export function AttachmentLabel({ attachment }: { attachment: ChatAttachment }) {
  const { t } = useTranslation();
  return (
    <span className={styles['attachment']}>
      <FileText size={12} aria-hidden="true" />
      {attachment.lines
        ? t('chat.attachedLines', {
            path: attachment.path,
            start: attachment.lines.start,
            end: attachment.lines.end,
          })
        : attachment.path}
    </span>
  );
}

/** The chat conversation with streamed answers and notices. */
export function ChatTranscript({
  items,
  streaming,
}: {
  items: readonly ChatItem[];
  streaming: boolean;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Follow new output, unless the user scrolled up to read.
  useEffect(() => {
    const element = scrollRef.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [items]);

  return (
    <div
      ref={scrollRef}
      className={styles['root']}
      role="log"
      aria-label={t('chat.conversation')}
      aria-live="polite"
      aria-busy={streaming}
      tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget;
        stickToBottom.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 40;
      }}
    >
      {items.length === 0 && <p className={styles['empty']}>{t('chat.emptyText')}</p>}
      {items.map((item) => {
        switch (item.kind) {
          case 'message': {
            const { message } = item;
            if (message.role === 'user') {
              return (
                <div key={item.id} className={styles['user']}>
                  <span className="visually-hidden">{t('agent.you')}: </span>
                  {message.text}
                  {message.attachment && <AttachmentLabel attachment={message.attachment} />}
                </div>
              );
            }
            return (
              <div key={item.id} className={styles['assistant']}>
                {message.text ? (
                  <Markdown text={message.text} />
                ) : (
                  <p className={styles['waiting']}>{t('chat.thinking')}</p>
                )}
                {message.model && <span className={styles['model']}>{message.model}</span>}
              </div>
            );
          }
          case 'fallback':
            return (
              <StatusMessage key={item.id} kind="warning">
                {t('chat.fallback', {
                  from: item.from,
                  to: item.to,
                  reason: t(`models.error.${item.error.kind}`),
                })}
              </StatusMessage>
            );
          case 'error':
            return (
              <StatusMessage key={item.id} kind="error">
                {t(`models.error.${item.error.kind}`)}
                {item.error.retryAfter !== null &&
                  ` ${t('models.retryAfter', { count: item.error.retryAfter })}`}
              </StatusMessage>
            );
          case 'stopped':
            return (
              <StatusMessage key={item.id} kind="info">
                {t('chat.stopped')}
              </StatusMessage>
            );
        }
      })}
    </div>
  );
}
