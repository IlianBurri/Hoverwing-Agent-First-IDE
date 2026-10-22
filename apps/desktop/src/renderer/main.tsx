import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design';
import { App } from './App';
import { initI18n, pickLanguage } from './i18n';
import { useAppStore } from './stores/app';
import { useSettingsStore } from './stores/settings';

/** Loads app info and settings before the first render to avoid flicker. */
async function bootstrap(): Promise<void> {
  const [info, settings] = await Promise.all([
    window.kestrel.invoke('app:getInfo'),
    window.kestrel.invoke('settings:get'),
  ]);
  if (info.ok) {
    useAppStore.getState().setInfo(info.data);
    document.documentElement.dataset['platform'] = info.data.platform;
  }
  // On failure the store keeps its defaults; the app still works.
  if (settings.ok) useSettingsStore.getState().replace(settings.data);

  const language =
    useSettingsStore.getState().settings.language ?? pickLanguage(navigator.languages);
  document.documentElement.lang = language;
  await initI18n(language);

  const container = document.getElementById('root');
  if (!container) throw new Error('Root element #root not found.');
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
