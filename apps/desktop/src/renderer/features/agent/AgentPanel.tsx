import { useEffect, useState } from 'react';
import { FolderOpen, History, Plus, Power, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SessionSummary } from '@kestrel/shared';
import { ContextMenu } from '../../components/ContextMenu';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { PanelHeader } from '../../layout/PanelHeader';
import { useAgentStore } from '../../stores/agent';
import { openModal } from '../../stores/modals';
import { usePermissionStore } from '../../stores/permissions';
import { useWorkspaceStore } from '../../stores/workspace';
import { CheckpointTimeline } from '../checkpoints';
import { PermissionCard } from '../permissions';
import { ChangesList } from '../review';
import { SandboxBadge } from '../sandbox';
import { loadAgentConfigs, startAgent, stopAgent } from './actions';
import { PlanView } from './PlanView';
import { PromptInput } from './PromptInput';
import { StartView } from './StartView';
import { Transcript } from './Transcript';
import styles from './AgentPanel.module.css';

export function AgentPanel() {
  const { t } = useTranslation();
  const workspace = useWorkspaceStore((state) => state.info);
  const pending = usePermissionStore((state) => state.pending);
  const { status, items, plan } = useAgentStore();
  const [history, setHistory] = useState<{
    x: number;
    y: number;
    sessions: SessionSummary[];
  } | null>(null);
  const inSession =
    status.sessionId !== null && (status.state === 'ready' || status.state === 'working');

  useEffect(() => {
    void loadAgentConfigs();
  }, []);

  async function showHistory(x: number, y: number) {
    const result = await window.kestrel.invoke('agent:listSessions');
    setHistory({ x, y, sessions: result.ok ? result.data : [] });
  }

  const title = status.agentName && inSession ? status.agentName : t('agent.title');

  return (
    <section className="panel-fill" aria-labelledby="agent-panel-title">
      <PanelHeader
        id="agent-panel-title"
        title={title}
        actions={
          workspace ? (
            <>
              {inSession && (
                <IconButton
                  size="sm"
                  icon={Plus}
                  label={t('agent.newSession')}
                  disabled={status.state === 'working'}
                  onClick={() => void startAgent()}
                />
              )}
              <IconButton
                size="sm"
                icon={History}
                label={t('agent.history')}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  void showHistory(rect.left, rect.bottom);
                }}
              />
              <IconButton
                size="sm"
                icon={Settings2}
                label={t('agent.manage')}
                onClick={() => {
                  openModal({ id: 'agents' });
                }}
              />
              {inSession && (
                <IconButton
                  size="sm"
                  icon={Power}
                  label={t('agent.end')}
                  onClick={() => void stopAgent()}
                />
              )}
            </>
          ) : undefined
        }
      />
      {!workspace ? (
        <EmptyState
          icon={FolderOpen}
          title={t('agent.noWorkspaceTitle')}
          description={t('agent.noWorkspaceText')}
        />
      ) : inSession ? (
        <div className={styles['session']}>
          <div className={styles['where']}>
            <SandboxBadge sandboxed={status.sandboxed} />
          </div>
          {plan.length > 0 && (
            <div className={styles['plan']}>
              <PlanView entries={plan} />
            </div>
          )}
          <Transcript items={items} />
          <ChangesList />
          {pending.length > 0 && (
            <div
              className={styles['permissions']}
              role="region"
              aria-label={t('permissions.pendingLabel')}
            >
              {pending.map((request) => (
                <PermissionCard key={request.id} request={request} />
              ))}
            </div>
          )}
          <PromptInput />
        </div>
      ) : (
        <StartView />
      )}
      {workspace && <CheckpointTimeline />}
      {history && (
        <ContextMenu
          label={t('agent.history')}
          x={history.x}
          y={history.y}
          entries={
            history.sessions.length === 0
              ? [{ id: 'none', label: t('agent.noHistory'), onSelect: () => undefined }]
              : history.sessions.slice(0, 15).map((session) => ({
                  id: session.id,
                  label: session.title || t('agent.untitledSession'),
                  onSelect: () => {
                    useAgentStore.setState({ selectedAgentId: session.agentId });
                    void startAgent(session.id);
                  },
                }))
          }
          onClose={() => {
            setHistory(null);
          }}
        />
      )}
    </section>
  );
}
