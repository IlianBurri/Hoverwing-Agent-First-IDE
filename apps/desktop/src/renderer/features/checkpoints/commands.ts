import { Save } from 'lucide-react';
import { i18next } from '../../i18n';
import { useCheckpointStore } from '../../stores/checkpoints';
import { registerCommands } from '../commands';
import { createCheckpoint } from './actions';

export function registerCheckpointCommands(): () => void {
  return registerCommands([
    {
      id: 'checkpoints.create',
      category: () => i18next.t('commands.category.agent'),
      title: () => i18next.t('checkpoints.create'),
      icon: Save,
      when: () => useCheckpointStore.getState().status.available,
      run: createCheckpoint,
    },
  ]);
}
