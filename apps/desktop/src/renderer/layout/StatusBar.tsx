import { Bot, Cpu, FolderClosed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../components/StatusMessage';
import { useSettingsStore } from '../stores/settings';
import { useAgentStore } from '../stores/agent';
import { useEditorStore } from '../stores/editor';
import { useWorkspaceStore } from '../stores/workspace';
import { SandboxBadge } from '../features/sandbox';
import styles from './StatusBar.module.css';

export function StatusBar() {
  const { t } = useTranslation();
  const saveError = useSettingsStore((state) => state.saveError);
  const workspace = useWorkspaceStore((state) => state.info);
  const cursor = useEditorStore((state) => state.cursor);
  const agent = useAgentStore((state) => state.status);
  const agentText =
    agent.agentName && agent.state !== 'idle' && agent.state !== 'stopped'
      ? `${agent.agentName} · ${t(`status.agentState.${agent.state}`)}`
      : t('status.agentNone');

  return (
    <footer className={styles['root']} aria-label={t('status.label')}>
      <div className={styles['group']}>
        <span className={styles['item']}>
          <Bot size={14} aria-hidden="true" />
          {agentText}
        </span>
        {agent.agentName && (agent.state === 'ready' || agent.state === 'working') && (
          <SandboxBadge sandboxed={agent.sandboxed} compact />
        )}
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
