import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  LoaderCircle,
  ListTodo,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PlanEntry } from '@kestrel/shared';
import styles from './PlanView.module.css';

const icons = { pending: Circle, in_progress: LoaderCircle, completed: CircleCheck } as const;

/** The agent's TODO list, updated live. */
export function PlanView({ entries }: { entries: readonly PlanEntry[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const done = entries.filter((entry) => entry.status === 'completed').length;
  if (entries.length === 0) return null;

  return (
    <section className={styles['root']} aria-labelledby="agent-plan-title">
      <button
        type="button"
        className={styles['header']}
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
        <ListTodo size={14} aria-hidden="true" />
        <h3 id="agent-plan-title" className={styles['title']}>
          {t('agent.plan')}
        </h3>
        <span className={styles['progress']}>
          {t('agent.planProgress', { done, total: entries.length })}
        </span>
      </button>
      {open && (
        <ol className={styles['list']}>
          {entries.map((entry, index) => {
            const Icon = icons[entry.status];
            return (
              <li key={`${String(index)}-${entry.content}`} className={styles[entry.status]}>
                <Icon size={14} aria-hidden="true" className={styles['icon']} />
                <span>
                  <span className="visually-hidden">{t(`agent.planStatus.${entry.status}`)}: </span>
                  {entry.content}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
