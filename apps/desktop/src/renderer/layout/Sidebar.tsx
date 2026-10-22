import { useTranslation } from 'react-i18next';
import { SearchView } from '../features/search';
import { FilesView } from '../features/workspace';
import { useSettingsStore } from '../stores/settings';
import { PanelHeader } from './PanelHeader';

export function Sidebar() {
  const { t } = useTranslation();
  const view = useSettingsStore((state) => state.settings.layout.sidebarView);

  return (
    <section className="panel-fill" aria-labelledby="sidebar-title">
      <PanelHeader id="sidebar-title" title={t(`sidebar.${view}.title`)} />
      {view === 'files' ? <FilesView /> : <SearchView />}
    </section>
  );
}
