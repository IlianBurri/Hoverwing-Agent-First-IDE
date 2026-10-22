import { useTranslation } from 'react-i18next';
import { Kbd } from '../../components/Kbd';
import { KestrelMark } from '../../components/KestrelMark';
import { Button } from '../../components/Button';
import { useWorkspaceStore } from '../../stores/workspace';
import { useKeybindingLabel } from '../commands';
import { openFolder, RecentList } from '../workspace';
import styles from './EditorArea.module.css';

function ShortcutHint({ commandId, label }: { commandId: string; label: string }) {
  const shortcut = useKeybindingLabel(commandId);
  if (!shortcut) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>
        <Kbd>{shortcut}</Kbd>
      </dd>
    </>
  );
}

/** Phase 1a: welcome screen. Tabs and Monaco follow in 1d. */
export function EditorArea() {
  const { t } = useTranslation();
  const workspace = useWorkspaceStore((state) => state.info);
  return (
    <section className={styles['root']} aria-label={t('editor.label')}>
      <div className={styles['welcome']}>
        <KestrelMark className={styles['mark']} />
        <h1 className={styles['title']}>{t('editor.welcomeTitle')}</h1>
        <p className={styles['text']}>
          {workspace ? t('editor.workspaceOpenText') : t('editor.welcomeText')}
        </p>
        {!workspace && (
          <div className={styles['actions']}>
            <Button variant="primary" onClick={() => void openFolder()}>
              {t('workspace.openFolder')}
            </Button>
          </div>
        )}
        <dl className={styles['shortcuts']}>
          <ShortcutHint commandId="workbench.commandPalette" label={t('commands.palette')} />
          <ShortcutHint commandId="workspace.openFolder" label={t('workspace.openFolder')} />
          <ShortcutHint commandId="view.toggleSidebar" label={t('layout.toggleSidebar')} />
          <ShortcutHint commandId="view.toggleBottom" label={t('layout.toggleBottom')} />
          <ShortcutHint commandId="view.toggleAgent" label={t('layout.toggleAgent')} />
        </dl>
        {!workspace && (
          <div className={styles['recent']}>
            <RecentList />
          </div>
        )}
      </div>
    </section>
  );
}
