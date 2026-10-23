import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { useAgentStore } from '../../stores/agent';
import styles from './AgentLog.module.css';

/** Diagnostic output (stderr) of the running agent. */
export function AgentLog() {
  const { t } = useTranslation();
  const log = useAgentStore((state) => state.log);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);

  if (log.length === 0) {
    return (
      <EmptyState
        icon={Terminal}
        title={t('agentLog.emptyTitle')}
        description={t('agentLog.emptyText')}
      />
    );
  }
  return (
    <pre ref={ref} className={styles['root']} aria-label={t('agentLog.title')} tabIndex={0}>
      {log.map((entry, index) => (
        <span key={String(index)}>
          {entry.line}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}
