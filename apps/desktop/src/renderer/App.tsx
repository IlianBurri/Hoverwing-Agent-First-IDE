import { useEffect } from 'react';
import { useApplyTheme } from './hooks/useApplyTheme';
import { AppShell } from './layout/AppShell';
import { subscribeToSettingsChanges } from './stores/settings';

export function App() {
  useApplyTheme();
  useEffect(() => subscribeToSettingsChanges(), []);
  return <AppShell />;
}
