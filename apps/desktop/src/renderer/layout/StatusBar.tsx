import { Bot, Cpu, FolderClosed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../components/StatusMessage';
import { useSettingsStore } from '../stores/settings';
import { useEditorStore } from '../stores/editor';
import { useWorkspaceStore } from '../stores/workspace';
import styles from './StatusBar.module.css';

export function StatusBar() {
  const { t } = useTranslation();
  const saveError = useSettingsStore((state) => state.saveError);
  const workspace = useWorkspaceStore((state) => state.info);
  const cursor = useEditorStore((state) => state.cursor);

  return (
    <footer className={styles['root']} aria-label={t('status.label')}>
      <div className={styles['group']}>
        <span className={styles['item']}>
          <Bot size={14} aria-hidden="true" />
          {t('status.agentNone')}
        </span>
        <span className={styles['item']}>
          <Cpu size={14} aria-hidden="true" />
          {t('status.modelNone')}
        </span>
      </div>
      <div className={styles['group']}>
        {saveError && <StatusMessage kind="error">{t('errors.settingsSave')}</StatusMessage>}
        {cursor && (
          <>
            <span className={styles['item']}>
              {t('status.cursor', { line: cursor.line, column: cursor.column })}
            </span>
            <span className={styles['item']}>{cursor.eol}</span>
            <span className={styles['item']}>{cursor.language}</span>
          </>
        )}
        <span className={styles['item']} title={workspace?.root}>
          <FolderClosed size={14} aria-hidden="true" />
          {workspace?.name ?? t('status.noProject')}
        </span>
      </div>
    </footer>
  );
}
