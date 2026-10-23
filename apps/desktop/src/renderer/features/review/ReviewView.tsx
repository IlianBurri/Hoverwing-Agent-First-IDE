import { lazy, Suspense, useEffect, useState } from 'react';
import { Check, CheckCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReviewDiff } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { StatusMessage } from '../../components/StatusMessage';
import { useReviewStore } from '../../stores/review';
import { resolveChange } from './actions';
import styles from './ReviewView.module.css';

const DiffHost = lazy(() => import('./DiffHost'));

type Loaded = { state: 'loading' } | { state: 'missing' } | { state: 'ready'; diff: ReviewDiff };

/** Reviews one agent change: diff view, hunk selection, accept/reject. */
export function ReviewView({ path }: { path: string }) {
  const { t } = useTranslation();
  const version = useReviewStore((state) => state.version);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [rejected, setRejected] = useState<ReadonlySet<number>>(new Set());
  const [revealLine, setRevealLine] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void window.kestrel.invoke('review:diff', { path }).then((result) => {
      if (!active) return;
      setLoaded(result.ok ? { state: 'ready', diff: result.data } : { state: 'missing' });
      setRejected(new Set());
    });
    return () => {
      active = false;
    };
  }, [path, version]);

  if (loaded.state === 'loading') return <p className={styles['muted']}>{t('review.loading')}</p>;
  if (loaded.state === 'missing') {
    return (
      <EmptyState icon={Check} title={t('review.doneTitle')} description={t('review.doneText')} />
    );
  }

  const { diff } = loaded;
  const kept = diff.hunks.map((hunk) => hunk.index).filter((index) => !rejected.has(index));

  function toggle(index: number) {
    const next = new Set(rejected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setRejected(next);
  }

  return (
    <div className={styles['root']}>
      <div className={styles['toolbar']}>
        <StatusMessage kind="info">
          {diff.source === 'held' ? t('review.heldInfo') : t('review.appliedInfo')}
        </StatusMessage>
        <div className={styles['actions']}>
          <Button onClick={() => void resolveChange(path, 'none')}>
            <X size={14} aria-hidden="true" />
            {t('review.rejectChange')}
          </Button>
          {diff.hunks.length > 1 && (
            <Button disabled={rejected.size === 0} onClick={() => void resolveChange(path, kept)}>
              <Check size={14} aria-hidden="true" />
              {t('review.applySelection', { count: kept.length, total: diff.hunks.length })}
            </Button>
          )}
          <Button variant="primary" onClick={() => void resolveChange(path, 'all')}>
            <CheckCheck size={14} aria-hidden="true" />
            {t('review.acceptChange')}
          </Button>
        </div>
      </div>
      <div className={styles['body']}>
        <Suspense fallback={<p className={styles['muted']}>{t('editor.loading')}</p>}>
          <DiffHost
            path={path}
            original={diff.original ?? ''}
            proposed={diff.proposed ?? ''}
            revealLine={revealLine}
          />
        </Suspense>
        {diff.hunks.length > 1 && (
          <fieldset className={styles['hunks']}>
            <legend className={styles['legend']}>{t('review.hunks')}</legend>
            {diff.hunks.map((hunk) => {
              const firstChange =
                hunk.lines.find((line) => line.startsWith('+') || line.startsWith('-')) ?? '';
              return (
                <div key={hunk.index} className={styles['hunk']}>
                  <label className={styles['hunkLabel']}>
                    <input
                      type="checkbox"
                      checked={!rejected.has(hunk.index)}
                      onChange={() => {
                        toggle(hunk.index);
                      }}
                    />
                    {t('review.hunkLabel', {
                      index: hunk.index + 1,
                      from: hunk.newStart,
                      to: hunk.newStart + Math.max(0, hunk.newLines - 1),
                    })}
                  </label>
                  <button
                    type="button"
                    className={styles['hunkPreview']}
                    onClick={() => {
                      setRevealLine(hunk.newStart);
                    }}
                  >
                    {firstChange.slice(0, 80)}
                  </button>
                </div>
              );
            })}
          </fieldset>
        )}
      </div>
    </div>
  );
}
