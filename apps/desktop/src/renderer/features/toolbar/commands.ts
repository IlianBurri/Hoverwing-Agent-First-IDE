import { Settings2 } from 'lucide-react';
import { i18next } from '../../i18n';
import { registerCommands } from '../commands';
import { openToolbarDialog } from './actions';

export function registerToolbarCommands(): () => void {
  return registerCommands([
    {
      id: 'toolbar.customize',
      category: () => i18next.t('commands.category.view'),
      title: () => i18next.t('toolbar.customize'),
      icon: Settings2,
      run: openToolbarDialog,
    },
  ]);
}
