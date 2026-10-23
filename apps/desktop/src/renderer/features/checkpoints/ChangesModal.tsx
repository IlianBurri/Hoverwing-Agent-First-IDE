import { useEffect, useState } from 'react';
import { FileMinus, FilePen, FilePlus, RotateCcw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Checkpoint, CheckpointChange } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { errorMessage } from '../../lib/errors';
import { closeModal } from '../../stores/modals';
import { restoreCheckpoint } from './actions';
import styles from './ChangesModal.module.css';

const statusIcons: Record<CheckpointChange['status'], LucideIcon> = {
  added: FilePlus,
  modified: FilePen,
  deleted: FileMinus,
};

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; changes: CheckpointChange[] };

/** What changed since a checkpoint, with restore for everything or single files. */
export function ChangesModal({ checkpoint }: { checkpoint: Checkpoint }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void window.kestrel.invoke('checkpoints:changes', { id: checkpoint.id }).then((result) => {
      if (!active) return;
      setLoaded(
        result.ok
          ? { state: 'ready', changes: result.data }
          : { state: 'error', message: errorMessage(result.error) },
      );
    });
    return () => {
      active = false;
    };
  }, [checkpoint.id, version]);

  async function restore(paths?: string[]) {
    const done = await restoreCheckpoint(checkpoint, paths);
    if (done && !paths) closeModal();
    else setVersion((value) => value + 1);
  }

  const title =
    checkpoint.kind === 'turn' ? checkpoint.label : t(`checkpoints.kind.${checkpoint.kind}`);

  return (
    <Modal title={t('checkpoints.changesTitle', { label: title })} onClose={closeModal} size="lg">
      <p className={styles['intro']}>{t('checkpoints.changesIntro')}</p>
      {loaded.state === 'loading' && <p className={styles['muted']}>{t('checkpoints.loading')}</p>}
      {loaded.state === 'error' && <p className={styles['error']}>{loaded.message}</p>}
      {loaded.state === 'ready' && loaded.changes.length === 0 && (
        <p className={styles['muted']}>{t('checkpoints.noChanges')}</p>
      )}
      {loaded.state === 'ready' && loaded.changes.length > 0 && (
        <>
          <ul className={styles['list']} aria-label={t('checkpoints.changedFiles')}>
            {loaded.changes.map((change) => {
              const Icon = statusIcons[change.status];
              return (
                <li key={change.path} className={styles['row']}>
                  <Icon size={14} aria-hidden="true" className={styles[change.status]} />
                  <code className={styles['path']}>{change.path}</code>
                  <span className={styles[change.status]}>
                    {t(`checkpoints.status.${change.status}`)}
                  </span>
                  <IconButton
                    size="sm"
                    icon={RotateCcw}
                    label={t('checkpoints.restoreFile', { path: change.path })}
                    onClick={() => void restore([change.path])}
                  />
                </li>
              );
            })}
          </ul>
          <div className={styles['actions']}>
            <Button variant="danger" onClick={() => void restore()}>
              <RotateCcw size={14} aria-hidden="true" />
              {t('checkpoints.restoreAll')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
