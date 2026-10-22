import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { StatusMessage } from '../../components/StatusMessage';
import type { OpenFile } from '../../stores/editor';
import { closeFile, keepMine, reloadFromDisk } from './actions';
import styles from './ExternalChangeBanner.module.css';

/** Shown when a file with unsaved edits changed or vanished on disk. */
export function ExternalChangeBanner({ file }: { file: OpenFile }) {
  const { t } = useTranslation();
  if (file.external === 'none') return null;

  return (
    <div className={styles['root']}>
      <StatusMessage kind="warning">
        {file.external === 'changed' ? t('editor.changedOnDisk') : t('editor.deletedOnDisk')}
      </StatusMessage>
      <div className={styles['actions']}>
        {file.external === 'changed' ? (
          <>
            <Button onClick={() => void reloadFromDisk(file.path)}>
              {t('editor.reloadFromDisk')}
            </Button>
            <Button onClick={() => void keepMine(file.path)}>{t('editor.keepMine')}</Button>
          </>
        ) : (
          <Button onClick={() => void closeFile(file.path)}>{t('editor.closeTabShort')}</Button>
        )}
      </div>
    </div>
  );
}
