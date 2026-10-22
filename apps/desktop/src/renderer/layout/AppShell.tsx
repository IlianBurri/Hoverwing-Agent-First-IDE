import { ActivityBar } from './ActivityBar';
import { StatusBar } from './StatusBar';
import { TitleBar } from './TitleBar';
import { Workbench } from './Workbench';
import styles from './AppShell.module.css';

export function AppShell() {
  return (
    <div className={styles['root']}>
      <TitleBar />
      <div className={styles['body']}>
        <ActivityBar />
        <main className={styles['main']}>
          <Workbench />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
