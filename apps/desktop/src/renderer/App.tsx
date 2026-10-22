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
import { registerWorkspaceCommands } from './features/workspace';
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
