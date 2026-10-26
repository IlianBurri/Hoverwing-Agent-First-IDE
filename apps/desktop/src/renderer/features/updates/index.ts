import { Download, RefreshCw, RotateCcw, ToggleLeft } from 'lucide-react';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { useSettingsStore } from '../../stores/settings';
import { notify } from '../../stores/toasts';
import { setUpdateStatus, useUpdateStore } from '../../stores/updates';
import { registerCommands } from '../commands';

const t = i18next.t.bind(i18next);

export async function loadUpdateStatus(): Promise<void> {
  const result = await window.kestrel.invoke('updates:status');
  if (result.ok) setUpdateStatus(result.data);
}

export async function checkForUpdates(): Promise<void> {
  const result = await window.kestrel.invoke('updates:check');
  if (!result.ok) {
    notifyError(t('updates.check'), result.error);
    return;
  }
  setUpdateStatus(result.data);
  const { state, version } = result.data;
  if (state === 'upToDate') notify('success', t('updates.upToDate'));
  else if (state === 'available') notify('info', t('updates.available', { version }));
  else if (state === 'disabled') notify('info', t('updates.disabledHint'));
  else if (state === 'error') notify('warning', t('updates.failed'));
}

export async function downloadUpdate(): Promise<void> {
  const result = await window.kestrel.invoke('updates:download');
  if (!result.ok) notifyError(t('updates.download'), result.error);
}

export async function installUpdate(): Promise<void> {
  await window.kestrel.invoke('updates:install');
}

export function registerUpdateCommands(): () => void {
  const category = () => i18next.t('commands.category.preferences');
  const state = () => useUpdateStore.getState().status?.state;
  return registerCommands([
    {
      id: 'updates.check',
      category,
      title: () => i18next.t('updates.check'),
      icon: RefreshCw,
      run: checkForUpdates,
    },
    {
      id: 'updates.download',
      category,
      title: () => i18next.t('updates.download'),
      icon: Download,
      when: () => state() === 'available',
      run: downloadUpdate,
    },
    {
      id: 'updates.install',
      category,
      title: () => i18next.t('updates.install'),
      icon: RotateCcw,
      when: () => state() === 'ready',
      run: installUpdate,
    },
    {
      id: 'updates.toggleCheck',
      category,
      title: () =>
        useSettingsStore.getState().settings.checkForUpdates
          ? i18next.t('updates.turnOff')
          : i18next.t('updates.turnOn'),
      icon: ToggleLeft,
      run: async () => {
        const { settings, update } = useSettingsStore.getState();
        await update({ checkForUpdates: !settings.checkForUpdates });
      },
    },
  ]);
}
