import { DockerView } from '../features/docker';
import { GitView } from '../features/git';
import { McpView } from '../features/mcp';
import { ModelsView } from '../features/providers';
import { openFile } from '../features/editor';
import { SearchView } from '../features/search';
import { FilesView } from '../features/workspace';
import { useSettingsStore } from '../stores/settings';

/** Each view renders its own header (title + actions). */
export function Sidebar() {
  const view = useSettingsStore((state) => state.settings.layout.sidebarView);
  return (
    <section className="panel-fill" aria-labelledby="sidebar-title">
      {view === 'files' && <FilesView onOpenFile={(path) => void openFile(path)} />}
      {view === 'search' && <SearchView />}
      {view === 'git' && <GitView />}
      {view === 'docker' && <DockerView />}
      {view === 'mcp' && <McpView />}
      {view === 'models' && <ModelsView />}
    </section>
  );
}
