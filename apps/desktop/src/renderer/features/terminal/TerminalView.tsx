import { SquareTerminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';

export function TerminalView() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={SquareTerminal}
      title={t('bottom.terminalEmptyTitle')}
      description={t('bottom.terminalEmptyText')}
    />
  );
}
