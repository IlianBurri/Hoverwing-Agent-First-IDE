import { Bot, Cpu, FolderClosed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../components/StatusMessage';
import { useSettingsStore } from '../stores/settings';
import { useWorkspaceStore } from '../stores/workspace';
import styles from './StatusBar.module.css';

export function StatusBar() {
  const { t } = useTranslation();
  const saveError = useSettingsStore((state) => state.saveError);
  const workspace = useWorkspaceStore((state) => state.info);

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
        <span className={styles['item']} title={workspace?.root}>
          <FolderClosed size={14} aria-hidden="true" />
          {workspace?.name ?? t('status.noProject')}
        </span>
      </div>
    </footer>
  );
}
