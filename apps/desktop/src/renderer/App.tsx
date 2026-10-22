import { useEffect } from 'react';
import {
  CommandPalette,
  registerWorkbenchCommands,
  useGlobalKeybindings,
} from './features/commands';
import { useApplyLanguage } from './hooks/useApplyLanguage';
import { useApplyTheme } from './hooks/useApplyTheme';
import { AppShell } from './layout/AppShell';
import { subscribeToSettingsChanges } from './stores/settings';

export function App() {
  useApplyTheme();
  useApplyLanguage();
  useGlobalKeybindings();
  useEffect(() => subscribeToSettingsChanges(), []);
  useEffect(() => registerWorkbenchCommands(), []);

  return (
    <>
      <AppShell />
      <CommandPalette />
    </>
  );
}
