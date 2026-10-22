import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional next steps, e.g. buttons. */
  children?: ReactNode;
}

/** Explains what an empty area is for and what to do next. */
export function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <div className={styles['root']}>
      <Icon className={styles['icon']} size={28} strokeWidth={1.5} aria-hidden="true" />
      <p className={styles['title']}>{title}</p>
      <p className={styles['description']}>{description}</p>
      {children && <div className={styles['actions']}>{children}</div>}
    </div>
  );
}
