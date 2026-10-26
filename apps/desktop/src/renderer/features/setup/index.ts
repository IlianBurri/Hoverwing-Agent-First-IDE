import { Wand } from 'lucide-react';
import { i18next } from '../../i18n';
import { registerCommands } from '../commands';
import { openSetup } from './actions';

export { openSetup } from './actions';
export { SetupWizard } from './SetupWizard';

export function registerSetupCommands(): () => void {
  return registerCommands([
    {
      id: 'setup.open',
      category: () => i18next.t('commands.category.models'),
      title: () => i18next.t('setup.open'),
      icon: Wand,
      run: openSetup,
    },
  ]);
}
