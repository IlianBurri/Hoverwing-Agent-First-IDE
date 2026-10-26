import type { CompletionSettings, ModelRef, ProviderConfig, ProviderView } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { errorMessage, notifyError } from '../../lib/errors';
import { confirm } from '../../stores/dialogs';
import { useProvidersStore } from '../../stores/providers';
import type { ProviderTest } from '../../stores/providers';
import { useSettingsStore } from '../../stores/settings';
import { notify } from '../../stores/toasts';

const t = i18next.t.bind(i18next);

export async function refreshProviders(): Promise<void> {
  const result = await window.kestrel.invoke('providers:list');
  if (result.ok) useProvidersStore.setState({ providers: result.data });
}

/** The stored configuration of a provider view (without the key flag). */
export function configOf(view: ProviderView): ProviderConfig {
  return {
    id: view.id,
    name: view.name,
    template: view.template,
    baseUrl: view.baseUrl,
    models: view.models,
  };
}

/** Saves a provider and, if given, its API key; false if it was not saved. */
export async function saveProvider(config: ProviderConfig, apiKey: string): Promise<boolean> {
  const result = await window.kestrel.invoke('providers:save', config);
  if (!result.ok) {
    notifyError(t('providers.save'), result.error);
    return false;
  }
  if (apiKey.trim()) {
    const stored = await window.kestrel.invoke('providers:setApiKey', {
      id: config.id,
      value: apiKey.trim(),
    });
    if (!stored.ok) notifyError(t('providers.save'), stored.error);
  }
  await refreshProviders();
  // The first provider becomes the chat model right away.
  const { settings, update } = useSettingsStore.getState();
  const first = config.models[0];
  if (!settings.chatModel && first)
    await update({ chatModel: { providerId: config.id, model: first } });
  notify('success', t('providers.saved', { name: config.name }));
  return true;
}

export async function clearApiKey(id: string): Promise<void> {
  const result = await window.kestrel.invoke('providers:setApiKey', { id, value: null });
  if (!result.ok) notifyError(t('providers.save'), result.error);
  await refreshProviders();
}

export async function deleteProvider(provider: ProviderView): Promise<boolean> {
  const confirmed = await confirm({
    title: t('providers.deleteTitle', { name: provider.name }),
    message: t('providers.deleteMessage'),
    confirmLabel: t('providers.delete'),
    danger: true,
  });
  if (!confirmed) return false;
  const result = await window.kestrel.invoke('providers:delete', { id: provider.id });
  if (!result.ok) notifyError(t('providers.delete'), result.error);
  // Settings must not point at a provider that is gone.
  const { settings, update } = useSettingsStore.getState();
  if (settings.chatModel?.providerId === provider.id) await update({ chatModel: null });
  if (settings.completion.model?.providerId === provider.id) {
    await update({ completion: { ...settings.completion, model: null } });
  }
  await refreshProviders();
  return result.ok;
}

export async function testProvider(id: string): Promise<void> {
  const setTest = (test: ProviderTest) => {
    useProvidersStore.setState((state) => ({ tests: { ...state.tests, [id]: test } }));
  };
  setTest({ state: 'testing' });
  const result = await window.kestrel.invoke('providers:test', { id });
  setTest(
    result.ok
      ? { state: 'ok', models: result.data.models }
      : { state: 'error', message: errorMessage(result.error) },
  );
}

export async function setChatModel(ref: ModelRef | null): Promise<void> {
  await useSettingsStore.getState().update({ chatModel: ref });
}

export async function updateCompletion(patch: Partial<CompletionSettings>): Promise<void> {
  const { settings, update } = useSettingsStore.getState();
  await update({ completion: { ...settings.completion, ...patch } });
  if (patch.enabled !== undefined || patch.model !== undefined) {
    useProvidersStore.setState({ completionError: null });
  }
}

export async function toggleCompletion(): Promise<void> {
  const { completion } = useSettingsStore.getState().settings;
  if (!completion.enabled && !completion.model) {
    notify('info', t('completion.chooseModelFirst'));
    return;
  }
  await updateCompletion({ enabled: !completion.enabled });
  notify('info', completion.enabled ? t('completion.turnedOff') : t('completion.turnedOn'));
}
