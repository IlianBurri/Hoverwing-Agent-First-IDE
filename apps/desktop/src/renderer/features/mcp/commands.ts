import { FileInput, Plug, Plus } from 'lucide-react';
import { i18next } from '../../i18n';
import { setPanelOpen } from '../../stores/layout';
import { openModal } from '../../stores/modals';
import { useSettingsStore } from '../../stores/settings';
import { useWorkspaceStore } from '../../stores/workspace';
import { registerCommands } from '../commands';
import { importFromProject } from './actions';

export function showMcpView(): void {
  const { settings, update } = useSettingsStore.getState();
  setPanelOpen('sidebar', true);
  if (settings.layout.sidebarView !== 'mcp') {
    void update({ layout: { ...settings.layout, sidebarView: 'mcp' } });
  }
}

export function registerMcpCommands(): () => void {
  const category = () => i18next.t('commands.category.mcp');
  return registerCommands([
    { id: 'mcp.show', category, title: () => i18next.t('mcp.show'), icon: Plug, run: showMcpView },
    {
      id: 'mcp.add',
      category,
      title: () => i18next.t('mcp.add'),
      icon: Plus,
      run: () => {
        openModal({ id: 'mcpServer', server: null });
      },
    },
    {
      id: 'mcp.import',
      category,
      title: () => i18next.t('mcp.importLabel'),
      icon: FileInput,
      when: () => useWorkspaceStore.getState().info !== null,
      run: importFromProject,
    },
  ]);
}
