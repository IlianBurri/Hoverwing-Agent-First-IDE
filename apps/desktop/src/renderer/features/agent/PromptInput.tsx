import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../../components/IconButton';
import { useActiveSlot } from '../../stores/agent';
import { cancelTurn, sendPrompt } from './actions';
import styles from './PromptInput.module.css';

/** Request to focus the prompt (e.g. from a command). */
let focusPrompt: (() => void) | null = null;
export function focusAgentInput(): void {
  focusPrompt?.();
}

export function PromptInput() {
  const { t } = useTranslation();
  const id = useId();
  const slot = useActiveSlot();
  const state = slot.status.state;
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const working = state === 'working';

  useEffect(() => {
    focusPrompt = () => ref.current?.focus();
    return () => {
      focusPrompt = null;
    };
  }, []);

  async function submit() {
    const value = text.trim();
    if (!value || state !== 'ready') return;
    setText('');
    if (!(await sendPrompt(value, slot.id))) setText(value);
  }

  return (
    <form
      className={styles['root']}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor={id} className="visually-hidden">
        {t('agent.inputLabel')}
      </label>
      <textarea
        ref={ref}
        id={id}
        className={styles['input']}
        rows={3}
        value={text}
        placeholder={working ? t('agent.workingPlaceholder') : t('agent.inputPlaceholder')}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
          }
          if (event.key === 'Escape' && working) {
            event.preventDefault();
            void cancelTurn(slot.id);
          }
        }}
      />
      <div className={styles['actions']}>
        <span className={styles['hint']}>{t('agent.inputHint')}</span>
        {working ? (
          <IconButton
            icon={Square}
            label={t('agent.stop')}
            className={styles['stop']}
            onClick={() => void cancelTurn(slot.id)}
          />
        ) : (
          <IconButton
            icon={ArrowUp}
            label={t('agent.send')}
            className={styles['send']}
            disabled={state !== 'ready' || text.trim() === ''}
            type="submit"
          />
        )}
      </div>
    </form>
  );
}
