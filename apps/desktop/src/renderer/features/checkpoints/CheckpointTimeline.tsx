import { useState } from 'react';
import { Bot, ChevronDown, ChevronRight, History, Plus, RotateCcw, Save } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CheckpointKind } from '@kestrel/shared';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { useCheckpointStore } from '../../stores/checkpoints';
import { openModal } from '../../stores/modals';
import { createCheckpoint } from './actions';
import styles from './CheckpointTimeline.module.css';

const kindIcons: Record<CheckpointKind, LucideIcon> = {
  turn: Bot,
  manual: Save,
  beforeRestore: RotateCcw,
};

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function formatTime(time: number): string {
  const sameDay = new Date(time).toDateString() === new Date().toDateString();
  return sameDay
    ? timeFormat.format(time)
    : `${dateFormat.format(time)} ${timeFormat.format(time)}`;
}

/** Saved states of the project; jump back to any of them. */
export function CheckpointTimeline() {
  const { t } = useTranslation();
  const { status, list } = useCheckpointStore();
  const [open, setOpen] = useState(true);

  if (status.reason === 'noWorkspace') return null;

  return (
    <section className={styles['root']} aria-labelledby="checkpoint-title">
      <div className={styles['header']}>
        <button
          type="button"
          className={styles['toggle']}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? (
            <ChevronDown size={14} aria-hidden="true" />
          ) : (
            <ChevronRight size={14} aria-hidden="true" />
          )}
          <History size={14} aria-hidden="true" />
          <h3 id="checkpoint-title" className={styles['title']}>
            {t('checkpoints.title')}
          </h3>
          <span className={styles['count']}>{list.length}</span>
        </button>
        {status.available && (
          <IconButton
            size="sm"
            icon={Plus}
            label={t('checkpoints.create')}
            onClick={() => void createCheckpoint()}
          />
        )}
      </div>
      {open && !status.available && status.reason === 'noGit' && (
        <div className={styles['notice']}>
          <StatusMessage kind="warning">{t('checkpoints.noGit')}</StatusMessage>
        </div>
      )}
      {open && status.available && list.length === 0 && (
        <p className={styles['empty']}>{t('checkpoints.empty')}</p>
      )}
      {open && list.length > 0 && (
        <ol className={styles['list']}>
          {list.map((checkpoint) => {
            const Icon = kindIcons[checkpoint.kind];
            return (
              <li key={checkpoint.id}>
                <button
                  type="button"
                  className={styles['item']}
                  onClick={() => {
                    openModal({ id: 'checkpointChanges', checkpoint });
                  }}
                >
                  <Icon size={14} aria-hidden="true" className={styles['icon']} />
                  <span className={styles['label']}>
                    {checkpoint.kind === 'turn'
                      ? checkpoint.label
                      : t(`checkpoints.kind.${checkpoint.kind}`)}
                  </span>
                  <time
                    className={styles['time']}
                    dateTime={new Date(checkpoint.time).toISOString()}
                  >
                    {formatTime(checkpoint.time)}
                  </time>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
