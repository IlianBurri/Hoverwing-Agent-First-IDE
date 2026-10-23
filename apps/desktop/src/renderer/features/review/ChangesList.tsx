import { Check, FileDiff, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { useReviewStore } from '../../stores/review';
import { openReview, resolveAllChanges, resolveChange } from './actions';
import styles from './ChangesList.module.css';

/** Agent changes waiting for a decision, shown in the agent panel. */
export function ChangesList() {
  const { t } = useTranslation();
  const files = useReviewStore((state) => state.files);
  if (files.length === 0) return null;

  return (
    <section className={styles['root']} aria-labelledby="review-title">
      <div className={styles['header']}>
        <h3 id="review-title" className={styles['title']}>
          {t('review.title', { count: files.length })}
        </h3>
        <div className={styles['bulk']}>
          <Button variant="ghost" onClick={() => void resolveAllChanges('none')}>
            {t('review.rejectAll')}
          </Button>
          <Button variant="primary" onClick={() => void resolveAllChanges('all')}>
            {t('review.acceptAll')}
          </Button>
        </div>
      </div>
      <ul className={styles['list']}>
        {files.map((file) => (
          <li key={file.path} className={styles['row']}>
            <button
              type="button"
              className={styles['file']}
              onClick={() => {
                openReview(file.path);
              }}
            >
              <FileDiff size={14} aria-hidden="true" className={styles[file.status]} />
              <span className={styles['path']}>{file.path}</span>
              <span className={styles['added']}>+{file.additions}</span>
              <span className={styles['deleted']}>−{file.deletions}</span>
              <span className={styles['badge']}>{t(`review.source.${file.source}`)}</span>
            </button>
            <IconButton
              size="sm"
              icon={X}
              label={t('review.rejectFile', { path: file.path })}
              onClick={() => void resolveChange(file.path, 'none')}
            />
            <IconButton
              size="sm"
              icon={Check}
              label={t('review.acceptFile', { path: file.path })}
              onClick={() => void resolveChange(file.path, 'all')}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
