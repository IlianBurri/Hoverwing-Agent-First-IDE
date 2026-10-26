import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { browserTabPath, forgetBrowserTab, setBrowserState } from '../../stores/browser';
import { confirm } from '../../stores/dialogs';
import { useEditorStore } from '../../stores/editor';
import { notify } from '../../stores/toasts';

const t = i18next.t.bind(i18next);

/** Opens a browser tab in the editor area (empty, or with `url`). */
export async function openBrowser(url?: string): Promise<void> {
  const result = await window.kestrel.invoke('browser:create', url ? { url } : {});
  if (!result.ok) {
    notifyError(t('browser.open'), result.error);
    return;
  }
  const state = result.data;
  setBrowserState(state);
  const path = browserTabPath(state.tabId);
  useEditorStore.setState((editor) => ({
    files: [
      ...editor.files,
      {
        path,
        kind: 'browser',
        browserTabId: state.tabId,
        dirty: false,
        mtimeMs: null,
        external: 'none',
      },
    ],
    active: path,
  }));
}

export async function navigate(tabId: string, input: string): Promise<boolean> {
  const result = await window.kestrel.invoke('browser:navigate', { tabId, url: input });
  if (!result.ok) notifyError(t('browser.navigate'), result.error);
  return result.ok;
}

/** Called when the editor tab closes. */
export function closeBrowserTab(tabId: string): void {
  forgetBrowserTab(tabId);
  void window.kestrel.invoke('browser:close', { tabId });
}

export async function clearBrowserData(): Promise<void> {
  const confirmed = await confirm({
    title: t('browser.clearDataTitle'),
    message: t('browser.clearDataMessage'),
    confirmLabel: t('browser.clearData'),
    danger: true,
  });
  if (!confirmed) return;
  const result = await window.kestrel.invoke('browser:clearData');
  if (result.ok) notify('success', t('browser.dataCleared'));
  else notifyError(t('browser.clearData'), result.error);
}

/** The browser tab shown in the editor, if any. */
export function activeBrowserTab(): string | null {
  const { files, active } = useEditorStore.getState();
  return files.find((file) => file.path === active)?.browserTabId ?? null;
}
