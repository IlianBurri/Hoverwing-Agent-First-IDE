import { FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';

export function FilesView() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={FolderOpen}
      title={t('sidebar.files.emptyTitle')}
      description={t('sidebar.files.emptyText')}
    />
  );
}
