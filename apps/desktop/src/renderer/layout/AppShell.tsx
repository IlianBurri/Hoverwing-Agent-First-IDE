import { ActivityBar } from './ActivityBar';
import { StatusBar } from './StatusBar';
import { TitleBar } from './TitleBar';
import { Workbench } from './Workbench';
import { useSettingsStore } from '../stores/settings';
import styles from './AppShell.module.css';

export function AppShell() {
  const workbench = useSettingsStore((state) => state.settings.workbench);
  // The activity bar sits next to the sidebar it controls.
  const activityBar = workbench.activityBar.visible && <ActivityBar />;
  return (
    <div className={styles['root']}>
      <TitleBar />
      <div className={styles['body']}>
        {workbench.sidebarSide === 'left' && activityBar}
        <main className={styles['main']}>
          <Workbench />
        </main>
        {workbench.sidebarSide === 'right' && activityBar}
      </div>
      <StatusBar />
    </div>
  );
}
