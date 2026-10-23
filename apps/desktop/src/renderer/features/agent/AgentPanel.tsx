import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { PanelHeader } from '../../layout/PanelHeader';
import { usePermissionStore } from '../../stores/permissions';
import { PermissionCard } from '../permissions';
import styles from './AgentPanel.module.css';

export function AgentPanel() {
  const { t } = useTranslation();
  const pending = usePermissionStore((state) => state.pending);

  return (
    <section className="panel-fill" aria-labelledby="agent-panel-title">
      <PanelHeader id="agent-panel-title" title={t('agent.title')} />
      {pending.length > 0 && (
        <div
          className={styles['permissions']}
          role="region"
          aria-live="polite"
          aria-label={t('permissions.pendingLabel')}
        >
          {pending.map((request) => (
            <PermissionCard key={request.id} request={request} />
          ))}
        </div>
      )}
      {pending.length === 0 && (
        <EmptyState icon={Bot} title={t('agent.emptyTitle')} description={t('agent.emptyText')} />
      )}
    </section>
  );
}
