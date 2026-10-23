import type { Checkpoint } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { refreshCheckpoints } from '../../stores/checkpoints';
import { confirm } from '../../stores/dialogs';
import { notify } from '../../stores/toasts';

const t = i18next.t.bind(i18next);

export async function createCheckpoint(): Promise<void> {
  const result = await window.kestrel.invoke('checkpoints:create', {
    label: t('checkpoints.manualLabel'),
  });
  if (!result.ok) {
    notifyError(t('checkpoints.create'), result.error);
    return;
  }
  notify('success', t('checkpoints.created'));
  await refreshCheckpoints();
}

/** Restores the whole project or some files; asks first. */
export async function restoreCheckpoint(
  checkpoint: Checkpoint,
  paths?: readonly string[],
): Promise<boolean> {
  const confirmed = await confirm({
    title: paths
      ? t('checkpoints.restoreFilesTitle', { count: paths.length })
      : t('checkpoints.restoreAllTitle'),
    message: t('checkpoints.restoreMessage'),
    confirmLabel: t('checkpoints.restore'),
    danger: true,
  });
  if (!confirmed) return false;
  const result = await window.kestrel.invoke('checkpoints:restore', {
    id: checkpoint.id,
    ...(paths ? { paths: [...paths] } : {}),
  });
  if (!result.ok) {
    notifyError(t('checkpoints.restore'), result.error);
    return false;
  }
  notify('success', t('checkpoints.restored', { count: result.data.restored }));
  await refreshCheckpoints();
  return true;
}
