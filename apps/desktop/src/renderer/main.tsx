import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design';
import { App } from './App';
import { initI18n, pickLanguage } from './i18n';

async function bootstrap(): Promise<void> {
  const language = pickLanguage(navigator.languages);
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
