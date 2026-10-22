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
import { registerTerminalCommands } from './features/terminal';
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
      <DialogHost />
      <Toasts />
    </>
  );
}
