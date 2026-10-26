import { Cpu, Plus, Sparkles } from 'lucide-react';
import { i18next } from '../../i18n';
import { setPanelOpen } from '../../stores/layout';
import { openModal } from '../../stores/modals';
import { useSettingsStore } from '../../stores/settings';
import { registerCommands } from '../commands';
import { toggleCompletion } from './actions';

export function showModelsView(): void {
  const { settings, update } = useSettingsStore.getState();
  setPanelOpen('sidebar', true);
  if (settings.layout.sidebarView !== 'models') {
    void update({ layout: { ...settings.layout, sidebarView: 'models' } });
  }
}

export function registerProviderCommands(): () => void {
  const category = () => i18next.t('commands.category.models');
  return registerCommands([
    {
      id: 'models.show',
      category,
      title: () => i18next.t('models.show'),
      icon: Cpu,
      run: showModelsView,
    },
    {
      id: 'models.addProvider',
      category,
      title: () => i18next.t('providers.add'),
      icon: Plus,
      run: () => {
        openModal({ id: 'provider', provider: null });
      },
    },
    {
      id: 'completion.toggle',
      category,
      title: () => i18next.t('completion.toggle'),
      icon: Sparkles,
      run: toggleCompletion,
    },
  ]);
}
