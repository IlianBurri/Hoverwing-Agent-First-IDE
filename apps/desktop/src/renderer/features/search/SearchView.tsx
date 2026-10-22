import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';

export function SearchView() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={Search}
      title={t('sidebar.search.emptyTitle')}
      description={t('sidebar.search.emptyText')}
    />
  );
}
