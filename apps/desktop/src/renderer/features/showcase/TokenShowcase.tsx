import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../../components/StatusMessage';
import type { StatusKind } from '../../components/StatusMessage';
import styles from './TokenShowcase.module.css';

const colorTokens = [
  'bg',
  'surface',
  'surface-raised',
  'border',
  'text',
  'text-muted',
  'accent',
] as const;
const statusKinds: readonly StatusKind[] = ['success', 'warning', 'error', 'info'];
const spaceTokens = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Phase 0 placeholder page that renders every design token. */
export function TokenShowcase() {
  const { t } = useTranslation();

  return (
    <div className={styles['grid']}>
      <section className={styles['card']} aria-labelledby="sc-colors">
        <h2 id="sc-colors">{t('showcase.colors')}</h2>
        <ul className={styles['swatches']}>
          {colorTokens.map((token) => (
            <li key={token}>
              <span
                className={styles['swatch']}
                style={{ background: `var(--${token})` }}
                aria-hidden="true"
              />
              <code>--{token}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles['card']} aria-labelledby="sc-status">
        <h2 id="sc-status">{t('showcase.status')}</h2>
        <div className={styles['stack']}>
          {statusKinds.map((kind) => (
            <StatusMessage key={kind} kind={kind}>
              {t(`status.${kind}`)}
            </StatusMessage>
          ))}
        </div>
      </section>

      <section className={styles['card']} aria-labelledby="sc-type">
        <h2 id="sc-type">{t('showcase.typography')}</h2>
        <p className={styles['uiSample']}>{t('showcase.uiSample')}</p>
        <pre className={styles['codeSample']}>
          <code>{t('showcase.codeSample')}</code>
        </pre>
      </section>

      <section className={styles['card']} aria-labelledby="sc-buttons">
        <h2 id="sc-buttons">{t('showcase.buttons')}</h2>
        <div className={styles['row']}>
          <button type="button" className={styles['primary']}>
            {t('showcase.primary')}
          </button>
          <button type="button" className={styles['secondary']}>
            {t('showcase.secondary')}
          </button>
        </div>
      </section>

      <section
        className={`${styles['card'] ?? ''} ${styles['wide'] ?? ''}`}
        aria-labelledby="sc-space"
      >
        <h2 id="sc-space">{t('showcase.spacing')}</h2>
        <ul className={styles['spaces']}>
          {spaceTokens.map((step) => (
            <li key={step}>
              <span
                className={styles['spaceBar']}
                style={{ width: `var(--space-${step})` }}
                aria-hidden="true"
              />
              <code>--space-{step}</code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
