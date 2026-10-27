import type { LspServerConfig } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { confirm } from '../../stores/dialogs';
import { setPanelOpen } from '../../stores/layout';
import { replaceDiagnostics, useLspStore } from '../../stores/lsp';
import { openModal } from '../../stores/modals';
import { useSettingsStore } from '../../stores/settings';

const t = i18next.t.bind(i18next);

/** Diagnostics and server states of this window (after a reload or folder change). */
export async function loadLspState(): Promise<void> {
  const [diagnostics, statuses] = await Promise.all([
    window.kestrel.invoke('lsp:diagnostics'),
    window.kestrel.invoke('lsp:status'),
  ]);
  replaceDiagnostics(diagnostics.ok ? diagnostics.data : []);
  useLspStore.setState({ statuses: statuses.ok ? statuses.data : [] });
}

export async function refreshLspServers(): Promise<void> {
  const result = await window.kestrel.invoke('lsp:listServers');
  if (result.ok) useLspStore.setState({ servers: result.data });
}

export async function restartLanguageServers(): Promise<void> {
  const result = await window.kestrel.invoke('lsp:restart');
  if (!result.ok) notifyError(t('lsp.restart'), result.error);
}

export function showProblems(): void {
  const { settings, update } = useSettingsStore.getState();
  setPanelOpen('bottom', true);
  if (settings.layout.bottomView !== 'problems') {
    void update({ layout: { ...settings.layout, bottomView: 'problems' } });
  }
}

export function openLspServers(): void {
  void refreshLspServers();
  openModal({ id: 'lspServers' });
}

export async function saveLspServer(config: LspServerConfig): Promise<boolean> {
  const result = await window.kestrel.invoke('lsp:saveServer', config);
  if (!result.ok) {
    notifyError(t('lsp.save'), result.error);
    return false;
  }
  await refreshLspServers();
  return true;
}

/** Custom servers are removed, builtin ones reset to their template. */
export async function removeLspServer(id: string, builtin: boolean, name: string): Promise<void> {
  const confirmed = await confirm({
    title: builtin ? t('lsp.resetTitle', { name }) : t('lsp.deleteTitle', { name }),
    message: builtin ? t('lsp.resetMessage') : t('lsp.deleteMessage'),
    confirmLabel: builtin ? t('lsp.reset') : t('lsp.delete'),
    danger: !builtin,
  });
  if (!confirmed) return;
  const result = await window.kestrel.invoke('lsp:deleteServer', { id });
  if (!result.ok) notifyError(builtin ? t('lsp.reset') : t('lsp.delete'), result.error);
  await refreshLspServers();
}
