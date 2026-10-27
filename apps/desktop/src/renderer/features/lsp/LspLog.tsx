import { useEffect, useRef } from 'react';
import { Braces } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { useLspStore } from '../../stores/lsp';
import styles from '../agent/AgentLog.module.css';

/** Diagnostic output of language servers (stderr, log messages, crashes). */
export function LspLog() {
  const { t } = useTranslation();
  const log = useLspStore((state) => state.log);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);

  if (log.length === 0) {
    return (
      <EmptyState
        icon={Braces}
        title={t('lsp.logEmptyTitle')}
        description={t('lsp.logEmptyText')}
      />
    );
  }
  return (
    <pre ref={ref} className={styles['root']} aria-label={t('lsp.logTitle')} tabIndex={0}>
      {log.map((entry, index) => (
        <span key={String(index)}>
          {entry.line}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}
