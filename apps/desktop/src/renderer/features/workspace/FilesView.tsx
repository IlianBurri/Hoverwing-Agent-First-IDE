import {
  CircleAlert,
  FilePlus,
  FolderOpen,
  FolderPlus,
  ListCollapse,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { PanelHeader } from '../../layout/PanelHeader';
import { collapseAll, loadDir, useWorkspaceStore } from '../../stores/workspace';
import { errorMessage } from '../../lib/errors';
import { createEntry, openFolder } from './actions';
import { FileTree } from './FileTree';
import { RecentList } from './RecentList';
import styles from './FilesView.module.css';

interface FilesViewProps {
  onOpenFile: (path: string) => void;
}

export function FilesView({ onOpenFile }: FilesViewProps) {
  const { t } = useTranslation();
  const info = useWorkspaceStore((state) => state.info);
  const root = useWorkspaceStore((state) => state.dirs['']);

  if (!info) {
    return (
      <>
        <PanelHeader id="sidebar-title" title={t('sidebar.files.title')} />
        <EmptyState
          icon={FolderOpen}
          title={t('sidebar.files.emptyTitle')}
          description={t('sidebar.files.emptyText')}
        >
          <Button variant="primary" onClick={() => void openFolder()}>
            {t('workspace.openFolder')}
          </Button>
        </EmptyState>
        <div className={styles['recent']}>
          <RecentList limit={3} />
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader
        id="sidebar-title"
        title={info.name}
        actions={
          <>
            <IconButton
              size="sm"
              icon={FilePlus}
              label={t('workspace.newFile')}
              onClick={() => void createEntry('file')}
            />
            <IconButton
              size="sm"
              icon={FolderPlus}
              label={t('workspace.newFolder')}
              onClick={() => void createEntry('directory')}
            />
            <IconButton
              size="sm"
              icon={RefreshCw}
              label={t('workspace.refresh')}
              onClick={() => void loadDir('')}
            />
            <IconButton
              size="sm"
              icon={ListCollapse}
              label={t('workspace.collapseAll')}
              onClick={collapseAll}
            />
          </>
        }
      />
      {root?.error ? (
        <EmptyState
          icon={CircleAlert}
          title={t('workspace.readError')}
          description={errorMessage({ code: root.error, message: '' })}
        />
      ) : root?.entries && root.entries.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={t('workspace.emptyFolderTitle')}
          description={t('workspace.emptyFolderText')}
        >
          <Button onClick={() => void createEntry('file', '')}>{t('workspace.newFile')}</Button>
        </EmptyState>
      ) : (
        <FileTree onOpenFile={onOpenFile} />
      )}
    </>
  );
}
