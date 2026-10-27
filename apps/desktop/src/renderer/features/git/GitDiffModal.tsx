import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitDiff } from '@kestrel/shared';
import { Modal } from '../../components/Modal';
import { StatusMessage } from '../../components/StatusMessage';
import { closeModal } from '../../stores/modals';
import styles from './GitDiffModal.module.css';

// The review's read-only Monaco diff view, loaded with Monaco on demand.
const DiffHost = lazy(() => import('../review/DiffHost'));

/** HEAD ↔ index (staged) or index ↔ work tree of one file. */
export function GitDiffModal({
  path,
  staged,
  diff,
}: {
  path: string;
  staged: boolean;
  diff: GitDiff;
}) {
  const { t } = useTranslation();
  const binary =
    (diff.original === null && diff.modified === null) ||
    (diff.original !== null && diff.modified !== null && diff.original === diff.modified);
  return (
    <Modal
      title={t(staged ? 'git.diffTitleStaged' : 'git.diffTitle', { path })}
      onClose={closeModal}
      size="lg"
    >
      <p className={styles['sides']}>{staged ? t('git.diffSidesStaged') : t('git.diffSides')}</p>
      {binary ? (
        <StatusMessage kind="info">{t('git.diffUnavailable')}</StatusMessage>
      ) : (
        <div className={styles['body']}>
          <Suspense fallback={<p>{t('editor.loading')}</p>}>
            <DiffHost
              path={path}
              original={diff.original ?? ''}
              proposed={diff.modified ?? ''}
              revealLine={null}
            />
          </Suspense>
        </div>
      )}
    </Modal>
  );
}
