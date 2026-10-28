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
import { isRunning, useActiveSlot, useAgentStore } from '../stores/agent';
import { usePermissionStore } from '../stores/permissions';
import { useEditorStore } from '../stores/editor';
import { useWorkspaceStore } from '../stores/workspace';
import { showDockerView } from '../features/docker';
import { showModelsView, toggleCompletion } from '../features/providers';
import { downloadUpdate, installUpdate } from '../features/updates';
import { useUpdateStore } from '../stores/updates';
import { useProvidersStore } from '../stores/providers';
import { SandboxBadge } from '../features/sandbox';
import { TrustBadge } from '../features/trust';
import { LspStatus } from '../features/lsp';
import { GitStatusItem } from '../features/git';
import { runningContainers, useDockerStore } from '../stores/docker';
import type { StatusItem } from '@kestrel/shared';
import { openLayoutMenu } from '../features/layout';
import styles from './StatusBar.module.css';

export function StatusBar() {
  const { t } = useTranslation();
  const saveError = useSettingsStore((state) => state.saveError);
  const workspace = useWorkspaceStore((state) => state.info);
  const cursor = useEditorStore((state) => state.cursor);
  const agent = useActiveSlot().status;
  const slots = useAgentStore((state) => state.slots);
  const waiting = usePermissionStore((state) => state.pending.length);
  const docker = useDockerStore((state) => state.overview);
  const chatModel = useSettingsStore((state) => state.settings.chatModel);
  const completion = useSettingsStore((state) => state.settings.completion);
  const completionError = useProvidersStore((state) => state.completionError);
  const update = useUpdateStore((state) => state.status);
  const statusBar = useSettingsStore((state) => state.settings.workbench.statusBar);
  const show = (item: StatusItem) => !statusBar.hidden.includes(item);
  const running = slots.filter((slot) => isRunning(slot.status));
  // One agent: its name and state. Several in parallel: how many.
  const single = running.length === 1 ? (running[0]?.status ?? agent) : agent;
  const agentText =
    running.length > 1
      ? t('status.agentsRunning', { count: running.length })
      : single.agentName && single.state !== 'idle' && single.state !== 'stopped'
        ? `${single.agentName} · ${t(`status.agentState.${single.state}`)}`
        : t('status.agentNone');
  const waitingText = waiting > 0 ? ` · ${t('status.agentsWaiting', { count: waiting })}` : '';

  const trustBadge = (
    <TrustBadge className={`${styles['button'] ?? ''} ${styles['warning'] ?? ''}`} />
  );
  // Hidden status bar: security notices (restricted mode) still show.
  if (!statusBar.visible) {
    return (
      <footer className={styles['minimal']} aria-label={t('status.label')}>
        {trustBadge}
      </footer>
    );
  }

  return (
    <footer
      className={styles['root']}
      aria-label={t('status.label')}
      onContextMenu={openLayoutMenu}
    >
      <div className={styles['group']}>
        {show('agent') && (
          <span className={styles['item']}>
            <Bot size={14} aria-hidden="true" />
            {agentText}
            {waitingText}
          </span>
        )}
        {agent.agentName && (agent.state === 'ready' || agent.state === 'working') && (
          <SandboxBadge sandboxed={agent.sandboxed} compact />
        )}
        {show('model') && (
          <button
            type="button"
            className={styles['button']}
            title={t('status.modelHint')}
            onClick={showModelsView}
          >
            <Cpu size={14} aria-hidden="true" />
            {chatModel ? chatModel.model : t('status.modelNone')}
          </button>
        )}
        {show('completion') && completion.model && (
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
        {show('git') && <GitStatusItem className={styles['button']} />}
        {show('containers') && docker?.docker === 'available' && (
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
        {show('problems') && workspace && (
          <LspStatus buttonClassName={styles['button']} warningClassName={styles['warning']} />
        )}
        {saveError && <StatusMessage kind="error">{t('errors.settingsSave')}</StatusMessage>}
        {show('cursor') && cursor && (
          <>
            <span className={styles['item']}>
              {t('status.cursor', { line: cursor.line, column: cursor.column })}
            </span>
            <span className={styles['item']}>{cursor.eol}</span>
            <span className={styles['item']}>{cursor.language}</span>
          </>
        )}
        {trustBadge}
        {show('project') && (
          <span className={styles['item']} title={workspace?.root}>
            <FolderClosed size={14} aria-hidden="true" />
            {workspace?.name ?? t('status.noProject')}
          </span>
        )}
      </div>
    </footer>
  );
}
