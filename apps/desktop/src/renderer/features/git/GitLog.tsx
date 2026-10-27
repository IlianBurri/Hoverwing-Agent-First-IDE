import { useEffect, useRef } from 'react';
import { GitBranch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { useGitStore } from '../../stores/git';
import styles from '../agent/AgentLog.module.css';

/** git's own messages (errors, push/pull output), credentials redacted in main. */
export function GitLog() {
  const { t } = useTranslation();
  const log = useGitStore((state) => state.log);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);

  if (log.length === 0) {
    return (
      <EmptyState
        icon={GitBranch}
        title={t('git.logEmptyTitle')}
        description={t('git.logEmptyText')}
      />
    );
  }
  return (
    <pre ref={ref} className={styles['root']} aria-label={t('git.logTitle')} tabIndex={0}>
      {log.map((entry, index) => (
        <span key={String(index)}>
          {entry.line}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}
