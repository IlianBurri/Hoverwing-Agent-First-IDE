import { useEffect, useSyncExternalStore } from 'react';
import { useSettingsStore } from '../stores/settings';
import { resolveTheme } from '../stores/theme';
import type { ResolvedTheme } from '../stores/theme';

const darkQuery = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(darkQuery);
  media.addEventListener('change', onChange);
  return () => {
    media.removeEventListener('change', onChange);
  };
}

function systemPrefersDark(): boolean {
  return window.matchMedia(darkQuery).matches;
}

/**
 * Writes the resolved theme to <html data-theme>, lets the native window
 * controls follow it, and returns it.
 */
export function useApplyTheme(): ResolvedTheme {
  const preference = useSettingsStore((state) => state.settings.theme);
  const prefersDark = useSyncExternalStore(subscribe, systemPrefersDark);
  const theme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
    void window.kestrel.invoke('window:setTitleBarTheme', theme);
  }, [theme]);

  return theme;
}
