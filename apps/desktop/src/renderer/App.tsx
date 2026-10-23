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
import { ChangesModal, registerCheckpointCommands } from './features/checkpoints';
import { RulesDialog, registerPermissionCommands } from './features/permissions';
import { refreshCheckpoints } from './stores/checkpoints';
import { useWorkspaceStore } from './stores/workspace';
import { registerTerminalCommands } from './features/terminal';
import { setPanelOpen } from './stores/layout';
import { useModalStore } from './stores/modals';
import { addLogEntry, addPending, loadPending, removePending } from './stores/permissions';
import { registerWorkspaceCommands } from './features/workspace';
import { deliverOutput, markExited } from './stores/terminal';
import { hasDirtyFiles } from './stores/editor';
import { AppShell } from './layout/AppShell';
import { applyWorkspaceChanges } from './stores/workspace';
import { subscribeToSettingsChanges } from './stores/settings';

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
  const workspaceRoot = useWorkspaceStore((state) => state.info?.root);
  useEffect(() => {
    void refreshCheckpoints();
  }, [workspaceRoot]);
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
      {modal?.id === 'checkpointChanges' && (
        <ChangesModal key={modal.checkpoint.id} checkpoint={modal.checkpoint} />
      )}
      <DialogHost />
      <Toasts />
    </>
  );
}
