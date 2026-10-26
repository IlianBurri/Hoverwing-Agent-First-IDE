import {
  ArrowDownToLine,
  Bot,
  Container,
  Cpu,
  FolderClosed,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../components/StatusMessage';
import { useSettingsStore } from '../stores/settings';
import { useAgentStore } from '../stores/agent';
import { useEditorStore } from '../stores/editor';
import { useWorkspaceStore } from '../stores/workspace';
import { showDockerView } from '../features/docker';
import { showModelsView, toggleCompletion } from '../features/providers';
import { downloadUpdate, installUpdate } from '../features/updates';
import { useUpdateStore } from '../stores/updates';
import { useProvidersStore } from '../stores/providers';
import { SandboxBadge } from '../features/sandbox';
import { runningContainers, useDockerStore } from '../stores/docker';
import styles from './StatusBar.module.css';

export function StatusBar() {
  const { t } = useTranslation();
  const saveError = useSettingsStore((state) => state.saveError);
  const workspace = useWorkspaceStore((state) => state.info);
  const cursor = useEditorStore((state) => state.cursor);
  const agent = useAgentStore((state) => state.status);
  const docker = useDockerStore((state) => state.overview);
  const chatModel = useSettingsStore((state) => state.settings.chatModel);
  const completion = useSettingsStore((state) => state.settings.completion);
  const completionError = useProvidersStore((state) => state.completionError);
  const update = useUpdateStore((state) => state.status);
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
        <button
          type="button"
          className={styles['button']}
          title={t('status.modelHint')}
          onClick={showModelsView}
        >
          <Cpu size={14} aria-hidden="true" />
          {chatModel ? chatModel.model : t('status.modelNone')}
        </button>
        {completion.model && (
          <button
            type="button"
            className={styles['button']}
            aria-pressed={completion.enabled}
            title={t('completion.toggle')}
            onClick={() => void toggleCompletion()}
          >
            {completion.enabled && completionError ? (
              <TriangleAlert size={14} aria-hidden="true" className={styles['warning']} />
            ) : (
              <Sparkles size={14} aria-hidden="true" />
            )}
            {completion.enabled
              ? completionError
                ? t('status.completionError', { reason: t(`models.error.${completionError}`) })
                : t('status.completionOn')
              : t('status.completionOff')}
          </button>
        )}
        {docker?.docker === 'available' && (
          <button type="button" className={styles['button']} onClick={showDockerView}>
            <Container size={14} aria-hidden="true" />
            {t('status.containers', { count: runningContainers(docker) })}
          </button>
        )}
      </div>
      <div className={styles['group']}>
        {update?.state === 'available' && (
          <button type="button" className={styles['button']} onClick={() => void downloadUpdate()}>
            <ArrowDownToLine size={14} aria-hidden="true" />
            {t('updates.availableShort', { version: update.version })}
          </button>
        )}
        {update?.state === 'downloading' && (
          <span className={styles['item']} role="status">
            <ArrowDownToLine size={14} aria-hidden="true" />
            {t('updates.downloading', { percent: update.percent ?? 0 })}
          </span>
        )}
        {update?.state === 'ready' && (
          <button type="button" className={styles['button']} onClick={() => void installUpdate()}>
            <RotateCcw size={14} aria-hidden="true" />
            {t('updates.restart', { version: update.version })}
          </button>
        )}
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
