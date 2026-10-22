import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { PanelHeader } from '../../layout/PanelHeader';

/** Phase 1 placeholder; the ACP agent UI follows in phase 2. */
export function AgentPanel() {
  const { t } = useTranslation();
  return (
    <section className="panel-fill" aria-labelledby="agent-panel-title">
      <PanelHeader id="agent-panel-title" title={t('agent.title')} />
      <EmptyState icon={Bot} title={t('agent.emptyTitle')} description={t('agent.emptyText')} />
    </section>
  );
}
