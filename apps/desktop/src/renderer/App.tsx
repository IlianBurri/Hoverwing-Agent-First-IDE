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
import { registerWorkspaceCommands } from './features/workspace';
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
  useEffect(() => window.kestrel.on('workspace:changed', applyWorkspaceChanges), []);

  return (
    <>
      <AppShell />
      <CommandPalette />
      <DialogHost />
      <Toasts />
    </>
  );
}
