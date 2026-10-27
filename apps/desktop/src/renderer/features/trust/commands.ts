import { ShieldCheck, ShieldOff } from 'lucide-react';
import { i18next } from '../../i18n';
import { useTrustStore } from '../../stores/trust';
import { registerCommands } from '../commands';
import { revokeTrust, trustProject } from './actions';

export function registerTrustCommands(): () => void {
  const category = () => i18next.t('commands.category.files');
  return registerCommands([
    {
      id: 'trust.grant',
      category,
      title: () => i18next.t('trust.grant'),
      icon: ShieldCheck,
      when: () => useTrustStore.getState().trusted === false,
      run: trustProject,
    },
    {
      id: 'trust.revoke',
      category,
      title: () => i18next.t('trust.revoke'),
      icon: ShieldOff,
      when: () => useTrustStore.getState().trusted === true,
      run: revokeTrust,
    },
  ]);
}
