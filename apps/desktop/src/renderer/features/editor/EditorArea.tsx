import { lazy, Suspense } from 'react';
import { FileWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { useEditorStore } from '../../stores/editor';
import { EditorTabs } from './EditorTabs';
import { ExternalChangeBanner } from './ExternalChangeBanner';
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

/** Shown when no file is open. */
function Welcome() {
  const { t } = useTranslation();
  const workspace = useWorkspaceStore((state) => state.info);
  return (
    <div className={styles['welcomeRoot']}>
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
    </div>
  );
}

// Monaco is several megabytes; load it only when the first file opens.
const MonacoHost = lazy(() => import('./MonacoHost'));

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${String(Math.ceil(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EditorArea() {
  const { t } = useTranslation();
  const files = useEditorStore((state) => state.files);
  const active = useEditorStore((state) => state.active);
  const file = files.find((entry) => entry.path === active);

  return (
    <section className={styles['root']} aria-label={t('editor.label')}>
      {files.length > 0 && <EditorTabs />}
      {file && <ExternalChangeBanner file={file} />}
      <div className={styles['content']}>
        {!file && <Welcome />}
        {file?.kind === 'text' && (
          <Suspense fallback={<div className={styles['loading']}>{t('editor.loading')}</div>}>
            <MonacoHost path={file.path} />
          </Suspense>
        )}
        {file && file.kind !== 'text' && (
          <EmptyState
            icon={FileWarning}
            title={file.kind === 'binary' ? t('editor.binaryTitle') : t('editor.tooLargeTitle')}
            description={
              file.kind === 'binary'
                ? t('editor.binaryText')
                : t('editor.tooLargeText', { size: formatSize(file.size ?? 0), limit: '5 MB' })
            }
          />
        )}
      </div>
    </section>
  );
}
