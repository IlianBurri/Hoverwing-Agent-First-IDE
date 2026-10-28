import { useEffect, useState } from 'react';
import { FolderOpen, History, MessageCirclePlus, Plus, Power, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ContextMenu } from '../../components/ContextMenu';
import type { MenuEntry } from '../../components/ContextMenu';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import { PanelHeader } from '../../layout/PanelHeader';
import { useActiveSlot, useAgentStore } from '../../stores/agent';
import { useChatStore } from '../../stores/chat';
import { openModal } from '../../stores/modals';
import { usePermissionStore } from '../../stores/permissions';
import { useWorkspaceStore } from '../../stores/workspace';
import { ChatView, listChats, newChat, openChat } from '../chat';
import { CheckpointTimeline } from '../checkpoints';
import { PermissionCard } from '../permissions';
import { ChangesList } from '../review';
import { SandboxBadge } from '../sandbox';
import { loadAgentConfigs, startAgent, stopAgent } from './actions';
import { AGENT_TAB_PANEL_ID, AgentTabs, isForSlot } from './AgentTabs';
import { PlanView } from './PlanView';
import { PromptInput } from './PromptInput';
import { StartView } from './StartView';
import { Transcript } from './Transcript';
import styles from './AgentPanel.module.css';

type Mode = 'agent' | 'chat';

/** The right panel: the ACP agent, or the built-in chat with a model. */
export function AgentPanel() {
  const { t } = useTranslation();
  const workspace = useWorkspaceStore((state) => state.info);
  const allPending = usePermissionStore((state) => state.pending);
  const slots = useAgentStore((state) => state.slots);
  const slot = useActiveSlot();
  const { status, items, plan } = slot;
  // This tab's questions; other agents' questions wait in their tabs.
  const pending = allPending.filter((request) => isForSlot(request, slot, slots, true));
  const [first, ...queued] = pending;
  const mode = useChatStore((state) => state.mode);
  const chatStreaming = useChatStore((state) => state.streaming);
  const [history, setHistory] = useState<{
    x: number;
    y: number;
    label: string;
    entries: MenuEntry[];
  } | null>(null);
  const inSession =
    status.sessionId !== null && (status.state === 'ready' || status.state === 'working');

  useEffect(() => {
    void loadAgentConfigs();
  }, []);

  async function showAgentHistory(x: number, y: number) {
    const result = await window.kestrel.invoke('agent:listSessions');
    const sessions = result.ok ? result.data : [];
    setHistory({
      x,
      y,
      label: t('agent.history'),
      entries:
        sessions.length === 0
          ? [{ id: 'none', label: t('agent.noHistory'), onSelect: () => undefined }]
          : sessions.slice(0, 15).map((session) => ({
              id: session.id,
              label: session.title || t('agent.untitledSession'),
              onSelect: () => {
                useAgentStore.setState({ selectedAgentId: session.agentId });
                void startAgent(session.id, slot.id);
              },
            })),
    });
  }

  async function showChatHistory(x: number, y: number) {
    const chats = await listChats();
    setHistory({
      x,
      y,
      label: t('chat.history'),
      entries:
        chats.length === 0
          ? [{ id: 'none', label: t('chat.noHistory'), onSelect: () => undefined }]
          : chats.slice(0, 15).map((chat) => ({
              id: chat.id,
              label: chat.title || t('agent.untitledSession'),
              onSelect: () => void openChat(chat.id),
            })),
    });
  }

  const title =
    mode === 'chat'
      ? t('chat.title')
      : status.agentName && inSession
        ? status.agentName
        : t('agent.title');

  const agentActions = workspace ? (
    <>
      {inSession && (
        <IconButton
          size="sm"
          icon={Plus}
          label={t('agent.newSession')}
          disabled={status.state === 'working'}
          onClick={() => void startAgent(undefined, slot.id)}
        />
      )}
      <IconButton
        size="sm"
        icon={History}
        label={t('agent.history')}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          void showAgentHistory(rect.left, rect.bottom);
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
          onClick={() => void stopAgent(slot.id)}
        />
      )}
    </>
  ) : undefined;

  const chatActions = (
    <>
      <IconButton
        size="sm"
        icon={MessageCirclePlus}
        label={t('chat.new')}
        disabled={chatStreaming}
        onClick={newChat}
      />
      <IconButton
        size="sm"
        icon={History}
        label={t('chat.history')}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          void showChatHistory(rect.left, rect.bottom);
        }}
      />
    </>
  );

  return (
    <section className="panel-fill" aria-labelledby="agent-panel-title">
      <PanelHeader
        id="agent-panel-title"
        title={title}
        actions={mode === 'chat' ? chatActions : agentActions}
      />
      <div className={styles['mode']}>
        <SegmentedControl<Mode>
          label={t('chat.modeLabel')}
          options={[
            { value: 'agent', label: t('chat.modeAgent') },
            { value: 'chat', label: t('chat.modeChat') },
          ]}
          value={mode}
          onChange={(value) => {
            useChatStore.setState({ mode: value });
          }}
        />
      </div>
      {mode === 'chat' ? (
        <ChatView />
      ) : !workspace ? (
        <EmptyState
          icon={FolderOpen}
          title={t('agent.noWorkspaceTitle')}
          description={t('agent.noWorkspaceText')}
        />
      ) : (
        <>
          <AgentTabs />
          <div
            id={AGENT_TAB_PANEL_ID}
            role="tabpanel"
            aria-label={status.agentName ?? t('agent.title')}
            className={styles['session']}
          >
            {inSession ? (
              <>
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
                {first && (
                  <div
                    className={styles['permissions']}
                    role="region"
                    aria-label={t('permissions.pendingLabel')}
                  >
                    {/* One question at a time; the others wait in line. */}
                    <PermissionCard key={first.id} request={first} />
                    {queued.length > 0 && (
                      <p className={styles['queued']}>
                        {t('permissions.queued', { count: queued.length })}
                      </p>
                    )}
                  </div>
                )}
                <PromptInput key={slot.id} />
              </>
            ) : (
              <StartView />
            )}
          </div>
        </>
      )}
      {mode === 'agent' && workspace && <CheckpointTimeline />}
      {history && (
        <ContextMenu
          label={history.label}
          x={history.x}
          y={history.y}
          entries={history.entries}
          onClose={() => {
            setHistory(null);
          }}
        />
      )}
    </section>
  );
}
