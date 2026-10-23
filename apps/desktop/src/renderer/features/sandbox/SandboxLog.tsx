import { useEffect, useRef } from 'react';
import { Container } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { useSandboxStore } from '../../stores/sandbox';
import styles from './SandboxLog.module.css';

/** Output of the sandbox image build. */
export function SandboxLog() {
  const { t } = useTranslation();
  const log = useSandboxStore((state) => state.log);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);

  if (log.length === 0) {
    return (
      <EmptyState
        icon={Container}
        title={t('sandbox.logEmptyTitle')}
        description={t('sandbox.logEmptyText')}
      />
    );
  }
  return (
    <pre ref={ref} className={styles['root']} aria-label={t('sandbox.logTitle')} tabIndex={0}>
      {log.map((entry, index) => (
        <span key={String(index)}>
          {entry.line}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}
