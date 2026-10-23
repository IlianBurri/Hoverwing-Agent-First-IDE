import { Container, Hammer, RefreshCw } from 'lucide-react';
import { i18next } from '../../i18n';
import { useDockerStore } from '../../stores/docker';
import { setPanelOpen } from '../../stores/layout';
import { useSettingsStore } from '../../stores/settings';
import { useWorkspaceStore } from '../../stores/workspace';
import { registerCommands } from '../commands';
import { buildImage, refreshDocker } from './actions';

export function showDockerView(): void {
  const { settings, update } = useSettingsStore.getState();
  setPanelOpen('sidebar', true);
  if (settings.layout.sidebarView !== 'docker') {
    void update({ layout: { ...settings.layout, sidebarView: 'docker' } });
  }
}

export function registerDockerCommands(): () => void {
  const category = () => i18next.t('commands.category.docker');
  return registerCommands([
    {
      id: 'docker.show',
      category,
      title: () => i18next.t('docker.show'),
      icon: Container,
      keybinding: 'Mod+Shift+D',
      run: showDockerView,
    },
    {
      id: 'docker.build',
      category,
      title: () => i18next.t('docker.buildImage'),
      icon: Hammer,
      when: () =>
        useWorkspaceStore.getState().info !== null &&
        useDockerStore.getState().overview?.docker === 'available',
      run: () => buildImage(),
    },
    {
      id: 'docker.refresh',
      category,
      title: () => i18next.t('docker.refresh'),
      icon: RefreshCw,
      run: refreshDocker,
    },
  ]);
}
