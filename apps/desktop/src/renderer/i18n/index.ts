import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './locales/de.json';
import en from './locales/en.json';

import { languageSchema } from '@kestrel/shared';
import type { Language } from '@kestrel/shared';

export type { Language };
export const supportedLanguages = languageSchema.options;

export const resources = {
  de: { translation: de },
  en: { translation: en },
} as const;

export function pickLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    const match = supportedLanguages.find((lang) => lang === base);
    if (match) return match;
  }
  return 'de';
}

export async function initI18n(language: Language): Promise<void> {
  await i18next.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export { i18next };
