import { ShieldCheck } from 'lucide-react';
import { i18next } from '../../i18n';
import { openModal } from '../../stores/modals';
import { registerCommands } from '../commands';

export function registerPermissionCommands(): () => void {
  return registerCommands([
    {
      id: 'permissions.manage',
      category: () => i18next.t('commands.category.agent'),
      title: () => i18next.t('permissions.rules.title'),
      icon: ShieldCheck,
      run: () => {
        openModal({ id: 'permissionRules' });
      },
    },
  ]);
}
