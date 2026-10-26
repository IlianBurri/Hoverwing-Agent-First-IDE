import { useEffect, useRef } from 'react';
import { Plug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { useMcpStore } from '../../stores/mcp';
import styles from '../agent/AgentLog.module.css';

/** Diagnostic output of MCP servers (stderr, connection errors). */
export function McpLog() {
  const { t } = useTranslation();
  const log = useMcpStore((state) => state.log);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);

  if (log.length === 0) {
    return (
      <EmptyState icon={Plug} title={t('mcp.logEmptyTitle')} description={t('mcp.logEmptyText')} />
    );
  }
  return (
    <pre ref={ref} className={styles['root']} aria-label={t('mcp.logTitle')} tabIndex={0}>
      {log.map((entry, index) => (
        <span key={String(index)}>
          {entry.line}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}
