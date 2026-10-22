import { FolderClosed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settings';
import { openRecent } from './actions';
import styles from './RecentList.module.css';

/** Recently opened folders; the main process only accepts these paths. */
export function RecentList({ limit = 5 }: { limit?: number }) {
  const { t } = useTranslation();
  const recent = useSettingsStore((state) => state.settings.recentWorkspaces).slice(0, limit);
  if (recent.length === 0) return null;

  return (
    <nav aria-label={t('workspace.recent')} className={styles['root']}>
      <h2 className={styles['heading']}>{t('workspace.recent')}</h2>
      <ul className={styles['list']}>
        {recent.map((root) => (
          <li key={root}>
            <button
              type="button"
              className={styles['item']}
              title={root}
              onClick={() => void openRecent(root)}
            >
              <FolderClosed size={14} aria-hidden="true" />
              <span className={styles['name']}>
                {root.split(/[\\/]/).filter(Boolean).pop() ?? root}
              </span>
              <span className={styles['path']}>{root}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
