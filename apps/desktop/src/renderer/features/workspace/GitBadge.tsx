import { useTranslation } from 'react-i18next';
import { useGitStore } from '../../stores/git';
import styles from './FileTree.module.css';

/** Git state of a tree entry: a letter for files, a dot for folders with changes. */
export function GitBadge({ path, directory }: { path: string; directory: boolean }) {
  const { t } = useTranslation();
  const decoration = useGitStore((state) => (directory ? null : state.decorations.get(path)));
  const changedFolder = useGitStore((state) => directory && state.changedFolders.has(path));
  if (decoration) {
    const label = t(`git.kind.${decoration.kind}`);
    return (
      <span
        className={`${styles['git'] ?? ''} ${styles[`git-${decoration.kind}`] ?? ''}`}
        title={label}
        aria-label={label}
      >
        {decoration.letter}
      </span>
    );
  }
  if (changedFolder) {
    return (
      <span
        className={styles['gitDot']}
        title={t('git.folderChanged')}
        aria-label={t('git.folderChanged')}
      >
        •
      </span>
    );
  }
  return null;
}
