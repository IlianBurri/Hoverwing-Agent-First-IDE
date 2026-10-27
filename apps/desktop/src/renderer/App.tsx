import { useEffect } from 'react';
import {
  CommandPalette,
  registerWorkbenchCommands,
  useGlobalKeybindings,
} from './features/commands';
import { useApplyLanguage } from './hooks/useApplyLanguage';
import { useApplyTheme } from './hooks/useApplyTheme';
import { DialogHost } from './components/Dialog';
import { Toasts } from './components/Toasts';
import { handleExternalChanges, registerEditorCommands } from './features/editor';
import { AgentsDialog, registerAgentCommands } from './features/agent';
import { ChangesModal, registerCheckpointCommands } from './features/checkpoints';
import { appendLog, applyEvent, setStatus as setAgentStatus } from './stores/agent';
import { RulesDialog, registerPermissionCommands } from './features/permissions';
import { refreshSandboxStatus, registerSandboxCommands } from './features/sandbox';
import { appendSandboxLog, setSandboxStatus } from './stores/sandbox';
import { refreshDocker, registerDockerCommands } from './features/docker';
import { deliverStream, endStream } from './stores/docker';
import { openBrowser, registerBrowserCommands, showBrowserTab } from './features/browser';
import { setBrowserState } from './stores/browser';
import { McpServerDialog, refreshMcp, registerMcpCommands } from './features/mcp';
import { ProviderDialog, refreshProviders, registerProviderCommands } from './features/providers';
import { registerChatCommands } from './features/chat';
import { loadUpdateStatus, registerUpdateCommands } from './features/updates';
import { setUpdateStatus } from './stores/updates';
import { SetupWizard, openSetup, registerSetupCommands } from './features/setup';
import { applySetupProgress } from './stores/setup';
import { applyChatEvent, useChatStore } from './stores/chat';
import { appendMcpLog } from './stores/mcp';
import { refreshCheckpoints } from './stores/checkpoints';
import { refreshReview } from './stores/review';
import { useWorkspaceStore } from './stores/workspace';
import { registerTerminalCommands } from './features/terminal';
import { onWorkspaceOpened, registerTrustCommands } from './features/trust';
import { setTrusted } from './stores/trust';
import {
  LspServersDialog,
  loadLspState,
  refreshLspServers,
  registerLspCommands,
} from './features/lsp';
import { appendLspLog, setDiagnostics, useLspStore } from './stores/lsp';
import { GitDiffModal, refreshGit, registerGitCommands } from './features/git';
import { appendGitLog } from './stores/git';
import { ToolbarDialog, registerToolbarCommands } from './features/toolbar';
import { LayoutDialog, registerLayoutCommands, registerProfileCommands } from './features/layout';
import { setPanelOpen } from './stores/layout';
import { useModalStore } from './stores/modals';
import { addLogEntry, addPending, loadPending, removePending } from './stores/permissions';
import { registerWorkspaceCommands } from './features/workspace';
import { deliverOutput, markExited } from './stores/terminal';
import { hasDirtyFiles } from './stores/editor';
import { AppShell } from './layout/AppShell';
import { applyWorkspaceChanges } from './stores/workspace';
import { subscribeToSettingsChanges, useSettingsStore } from './stores/settings';

export function App() {
  useApplyTheme();
  useApplyLanguage();
  useGlobalKeybindings();
  useEffect(() => subscribeToSettingsChanges(), []);
  useEffect(() => registerWorkbenchCommands(), []);
  useEffect(() => registerWorkspaceCommands(), []);
  useEffect(() => registerEditorCommands(), []);
  useEffect(() => registerTerminalCommands(), []);
  useEffect(() => registerPermissionCommands(), []);
  useEffect(() => registerCheckpointCommands(), []);
  useEffect(() => registerAgentCommands(), []);
  useEffect(() => registerSandboxCommands(), []);
  useEffect(() => registerDockerCommands(), []);
  useEffect(() => registerBrowserCommands(), []);
  useEffect(() => registerMcpCommands(), []);
  useEffect(() => registerProviderCommands(), []);
  useEffect(() => registerChatCommands(), []);
  useEffect(() => registerSetupCommands(), []);
  useEffect(() => registerUpdateCommands(), []);
  useEffect(() => registerTrustCommands(), []);
  useEffect(() => registerLspCommands(), []);
  useEffect(() => registerGitCommands(), []);
  useEffect(() => registerToolbarCommands(), []);
  useEffect(() => registerLayoutCommands(), []);
  const layoutProfiles = useSettingsStore((state) => state.settings.layoutProfiles);
  useEffect(() => registerProfileCommands(layoutProfiles), [layoutProfiles]);
  useEffect(() => {
    const offs = [
      window.kestrel.on('git:changed', () => {
        void refreshGit();
      }),
      window.kestrel.on('git:log', appendGitLog),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  useEffect(() => {
    const offs = [
      window.kestrel.on('lsp:diagnostics', setDiagnostics),
      window.kestrel.on('lsp:status', (statuses) => {
        useLspStore.setState({ statuses });
      }),
      window.kestrel.on('lsp:log', appendLspLog),
      window.kestrel.on('lsp:changed', () => {
        void refreshLspServers();
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  useEffect(() => {
    void loadUpdateStatus();
    return window.kestrel.on('updates:status', setUpdateStatus);
  }, []);
  useEffect(() => {
    // First start: the setup assistant opens once (it can be skipped).
    if (!useSettingsStore.getState().settings.setupDone) openSetup();
    return window.kestrel.on('setup:progress', applySetupProgress);
  }, []);
  useEffect(() => {
    void refreshProviders();
    const offs = [
      window.kestrel.on('providers:changed', () => {
        void refreshProviders();
      }),
      window.kestrel.on('chat:event', ({ chatId, event }) => {
        applyChatEvent(chatId, event);
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  useEffect(() => {
    const offs = [
      window.kestrel.on('mcp:changed', () => {
        void refreshMcp();
      }),
      window.kestrel.on('mcp:log', appendMcpLog),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  useEffect(() => {
    const offs = [
      window.kestrel.on('browser:state', setBrowserState),
      window.kestrel.on('browser:openTab', ({ url }) => {
        void openBrowser(url);
      }),
      window.kestrel.on('browser:opened', showBrowserTab),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  useEffect(() => {
    const offs = [
      window.kestrel.on('docker:changed', () => {
        void refreshDocker();
      }),
      window.kestrel.on('docker:output', ({ streamId, data }) => {
        deliverStream(streamId, data);
      }),
      window.kestrel.on('docker:streamEnded', ({ streamId, ok }) => {
        endStream(streamId, ok);
        void refreshDocker();
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  useEffect(() => {
    void refreshSandboxStatus();
    const offs = [
      window.kestrel.on('sandbox:status', setSandboxStatus),
      window.kestrel.on('sandbox:log', appendSandboxLog),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  useEffect(() => {
    void window.kestrel.invoke('agent:status').then((result) => {
      if (result.ok) setAgentStatus(result.data);
    });
    const offs = [
      window.kestrel.on('agent:status', setAgentStatus),
      window.kestrel.on('agent:event', ({ sessionId, event }) => {
        applyEvent(sessionId, event);
      }),
      window.kestrel.on('agent:log', appendLog),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  const workspaceRoot = useWorkspaceStore((state) => state.info?.root);
  useEffect(() => {
    void refreshCheckpoints();
    void refreshReview();
    // Also feeds the container count in the status bar.
    void refreshDocker();
    if (workspaceRoot) void onWorkspaceOpened();
    else setTrusted(null);
    void loadLspState();
    void refreshGit();
  }, [workspaceRoot]);
  useEffect(
    () =>
      window.kestrel.on('trust:changed', ({ trusted }) => {
        setTrusted(trusted);
      }),
    [],
  );
  useEffect(
    () =>
      window.kestrel.on('review:changed', () => {
        void refreshReview();
      }),
    [],
  );
  useEffect(
    () =>
      window.kestrel.on('checkpoints:changed', () => {
        void refreshCheckpoints();
      }),
    [],
  );
  useEffect(() => {
    void loadPending();
    const offs = [
      window.kestrel.on('permissions:request', (request) => {
        addPending(request);
        // Questions must never go unnoticed: show the agent panel.
        setPanelOpen('agent', true);
        useChatStore.setState({ mode: 'agent' });
      }),
      window.kestrel.on('permissions:resolved', ({ id }) => {
        removePending(id);
      }),
      window.kestrel.on('permissions:logged', addLogEntry),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  const modal = useModalStore((state) => state.open);
  useEffect(() => {
    const offData = window.kestrel.on('terminal:data', ({ id, data }) => {
      deliverOutput(id, data);
    });
    const offExit = window.kestrel.on('terminal:exit', ({ id, exitCode }) => {
      markExited(id, exitCode);
    });
    return () => {
      offData();
      offExit();
    };
  }, []);
  useEffect(
    () =>
      window.kestrel.on('workspace:changed', (changes) => {
        applyWorkspaceChanges(changes);
        void handleExternalChanges(changes);
      }),
    [],
  );
  useEffect(() => {
    // Unsaved edits: block closing/reloading; main then asks the user.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasDirtyFiles()) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  return (
    <>
      <AppShell />
      <CommandPalette />
      {modal?.id === 'permissionRules' && <RulesDialog />}
      {modal?.id === 'agents' && <AgentsDialog />}
      {modal?.id === 'mcpServer' && <McpServerDialog server={modal.server} />}
      {modal?.id === 'provider' && <ProviderDialog provider={modal.provider} />}
      {modal?.id === 'setup' && <SetupWizard />}
      {modal?.id === 'lspServers' && <LspServersDialog />}
      {modal?.id === 'toolbar' && <ToolbarDialog />}
      {modal?.id === 'layout' && <LayoutDialog />}
      {modal?.id === 'gitDiff' && (
        <GitDiffModal key={modal.path} path={modal.path} staged={modal.staged} diff={modal.diff} />
      )}
      {modal?.id === 'checkpointChanges' && (
        <ChangesModal key={modal.checkpoint.id} checkpoint={modal.checkpoint} />
      )}
      <DialogHost />
      <Toasts />
    </>
  );
}
