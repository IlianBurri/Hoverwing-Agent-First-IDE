import type { ReactNode } from 'react';
import styles from './PanelHeader.module.css';

interface PanelHeaderProps {
  id: string;
  title: string;
  actions?: ReactNode;
}

export function PanelHeader({ id, title, actions }: PanelHeaderProps) {
  return (
    <header className={styles['root']}>
      <h2 id={id} className={styles['title']}>
        {title}
      </h2>
      {actions && <div className={styles['actions']}>{actions}</div>}
    </header>
  );
}
