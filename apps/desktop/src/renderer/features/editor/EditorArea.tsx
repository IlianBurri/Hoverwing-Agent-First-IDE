import { useTranslation } from 'react-i18next';
import { KestrelMark } from '../../components/KestrelMark';
import styles from './EditorArea.module.css';

/** Phase 1a: welcome screen. Tabs and Monaco follow in 1d. */
export function EditorArea() {
  const { t } = useTranslation();
  return (
    <section className={styles['root']} aria-label={t('editor.label')}>
      <div className={styles['welcome']}>
        <KestrelMark className={styles['mark']} />
        <h1 className={styles['title']}>{t('editor.welcomeTitle')}</h1>
        <p className={styles['text']}>{t('editor.welcomeText')}</p>
      </div>
    </section>
  );
}
