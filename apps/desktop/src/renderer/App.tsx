import { useTranslation } from 'react-i18next';
import { SegmentedControl } from './components/SegmentedControl';
import { StatusMessage } from './components/StatusMessage';
import { TokenShowcase, useAppInfo } from './features/showcase';
import { useApplyTheme } from './hooks/useApplyTheme';
import { supportedLanguages } from './i18n';
import type { Language } from './i18n';
import { useThemeStore } from './stores/theme';
import type { ThemePreference } from './stores/theme';
import styles from './App.module.css';

const themeValues: readonly ThemePreference[] = ['dark', 'light', 'system'];

export function App() {
  const { t, i18n } = useTranslation();
  useApplyTheme();
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const appInfo = useAppInfo();
  const language = (i18n.resolvedLanguage ?? 'de') as Language;

  return (
    <div className={styles['shell']}>
      <header className={styles['header']}>
        <div>
          <h1 className={styles['title']}>Kestrel</h1>
          <p className={styles['tagline']}>{t('app.tagline')}</p>
        </div>
        <div className={styles['controls']}>
          <SegmentedControl
            label={t('theme.label')}
            options={themeValues.map((value) => ({ value, label: t(`theme.${value}`) }))}
            value={preference}
            onChange={setPreference}
          />
          <SegmentedControl
            label={t('language.label')}
            options={supportedLanguages.map((value) => ({ value, label: value.toUpperCase() }))}
            value={language}
            onChange={(value) => {
              void i18n.changeLanguage(value);
              document.documentElement.lang = value;
            }}
          />
        </div>
      </header>

      <main className={styles['main']}>
        <h2 className={styles['sectionTitle']}>{t('showcase.title')}</h2>
        <p className={styles['intro']}>{t('showcase.intro')}</p>
        <TokenShowcase />
      </main>

      <footer className={styles['footer']} data-testid="app-info">
        {appInfo.status === 'loading' && t('appInfo.loading')}
        {appInfo.status === 'ready' && t('appInfo.value', appInfo.info)}
        {appInfo.status === 'error' && (
          <StatusMessage kind="error">
            {t('appInfo.error', { message: appInfo.message })}
          </StatusMessage>
        )}
      </footer>
    </div>
  );
}
