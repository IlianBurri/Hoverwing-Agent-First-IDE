import { GitBranch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGitStore } from '../../stores/git';
import { showGitView } from './actions';

/** Status bar: current branch with ahead/behind; opens the Git view. */
export function GitStatusItem({ className }: { className?: string | undefined }) {
  const { t } = useTranslation();
  const status = useGitStore((state) => state.status);
  if (status?.state !== 'repo') return null;
  const branch = status.branch ?? t('git.detached', { head: status.head ?? '' });
  const sync =
    status.ahead > 0 || status.behind > 0
      ? ` ↑${String(status.ahead)} ↓${String(status.behind)}`
      : '';
  return (
    <button
      type="button"
      className={className}
      title={t('git.statusHint')}
      aria-label={t('git.statusLabel', { branch, changes: status.files.length })}
      onClick={showGitView}
    >
      <GitBranch size={14} aria-hidden="true" />
      {branch}
      {sync}
      {status.files.length > 0 && ` · ${String(status.files.length)}`}
    </button>
  );
}
