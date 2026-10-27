import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { confirm } from '../../stores/dialogs';
import { notify } from '../../stores/toasts';
import { setTrusted } from '../../stores/trust';

const t = i18next.t.bind(i18next);

export async function loadTrust(): Promise<boolean | null> {
  const result = await window.kestrel.invoke('trust:get');
  const trusted = result.ok ? result.data.trusted : null;
  setTrusted(trusted);
  return trusted;
}

/** Main asks natively; nothing is trusted without that dialog. */
export async function trustProject(): Promise<void> {
  const result = await window.kestrel.invoke('trust:grant');
  if (!result.ok) {
    notifyError(t('trust.grant'), result.error);
    return;
  }
  setTrusted(result.data.trusted);
}

export async function revokeTrust(): Promise<void> {
  const confirmed = await confirm({
    title: t('trust.revokeTitle'),
    message: t('trust.revokeMessage'),
    confirmLabel: t('trust.revoke'),
    danger: true,
  });
  if (!confirmed) return;
  const result = await window.kestrel.invoke('trust:revoke');
  if (!result.ok) {
    notifyError(t('trust.revoke'), result.error);
    return;
  }
  setTrusted(result.data.trusted);
}

/** After opening a folder: load its trust and explain restricted mode once. */
export async function onWorkspaceOpened(): Promise<void> {
  if ((await loadTrust()) === false) notify('info', t('trust.restrictedHint'));
}
