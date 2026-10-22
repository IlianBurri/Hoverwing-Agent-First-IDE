import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { PanelHeader } from '../../layout/PanelHeader';

export function SearchView() {
  const { t } = useTranslation();
  return (
    <>
      <PanelHeader id="sidebar-title" title={t('sidebar.search.title')} />
      <EmptyState
        icon={Search}
        title={t('sidebar.search.emptyTitle')}
        description={t('sidebar.search.emptyText')}
      />
    </>
  );
}
