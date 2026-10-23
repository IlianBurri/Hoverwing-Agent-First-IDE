import { useEffect, useRef } from 'react';
import { Brain, Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Markdown } from '../../components/Markdown';
import { StatusMessage } from '../../components/StatusMessage';
import type { TranscriptItem } from '../../stores/agent';
import { ToolCallCard } from './ToolCallCard';
import styles from './Transcript.module.css';

/** The conversation: prompts, streamed answers, thoughts, tool calls. */
export function Transcript({ items }: { items: readonly TranscriptItem[] }) {
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
      aria-label={t('agent.conversation')}
      aria-live="polite"
      tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget;
        stickToBottom.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 40;
      }}
    >
      {items.map((item) => {
        switch (item.kind) {
          case 'message':
            if (item.role === 'user') {
              return (
                <div key={item.id} className={styles['user']}>
                  <span className="visually-hidden">{t('agent.you')}: </span>
                  {item.text}
                </div>
              );
            }
            if (item.role === 'thought') {
              return (
                <details key={item.id} className={styles['thought']}>
                  <summary>
                    <Brain size={12} aria-hidden="true" /> {t('agent.thought')}
                  </summary>
                  <Markdown text={item.text} />
                </details>
              );
            }
            return (
              <div key={item.id} className={styles['agent']}>
                <Markdown text={item.text} />
              </div>
            );
          case 'toolCall':
            return <ToolCallCard key={item.id} toolCall={item.toolCall} />;
          case 'turn':
            return item.checkpointId ? (
              <div key={item.id} className={styles['turn']}>
                <Flag size={12} aria-hidden="true" /> {t('agent.checkpointSet')}
              </div>
            ) : null;
          case 'notice':
            return (
              <StatusMessage
                key={item.id}
                kind={
                  item.tone === 'error' ? 'error' : item.tone === 'warning' ? 'warning' : 'info'
                }
              >
                {['cancelled', 'refusal', 'max_tokens', 'max_turn_requests', 'error'].includes(
                  item.text,
                )
                  ? t(`agent.stopReason.${item.text as 'cancelled'}`)
                  : item.text}
              </StatusMessage>
            );
        }
      })}
    </div>
  );
}
