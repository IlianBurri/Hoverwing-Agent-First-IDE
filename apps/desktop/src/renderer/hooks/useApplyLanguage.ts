import { useEffect } from 'react';
import { i18next, pickLanguage } from '../i18n';
import { useSettingsStore } from '../stores/settings';

/** Switches the UI language when the setting changes (null = system). */
export function useApplyLanguage(): void {
  const preference = useSettingsStore((state) => state.settings.language);

  useEffect(() => {
    const language = preference ?? pickLanguage(navigator.languages);
    document.documentElement.lang = language;
    if (i18next.language !== language) void i18next.changeLanguage(language);
  }, [preference]);
}
