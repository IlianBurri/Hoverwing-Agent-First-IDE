import type { ModelPurpose } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { closeModal, openModal } from '../../stores/modals';
import { useSettingsStore } from '../../stores/settings';
import { useSetupStore } from '../../stores/setup';
import { notify } from '../../stores/toasts';
import { refreshProviders } from '../providers';

const t = i18next.t.bind(i18next);

export function openSetup(): void {
  openModal({ id: 'setup' });
}

export async function refreshOllama(): Promise<void> {
  const result = await window.kestrel.invoke('setup:ollamaStatus');
  if (result.ok) useSetupStore.setState({ ollama: result.data });
}

/** Loads what the assistant shows; hardware detection takes a few seconds. */
export async function loadSetup(): Promise<void> {
  useSetupStore.setState({ hardwareFailed: false });
  const [catalog] = await Promise.all([window.kestrel.invoke('setup:catalog'), refreshOllama()]);
  if (catalog.ok) useSetupStore.setState({ catalog: catalog.data });
  const hardware = await window.kestrel.invoke('setup:hardware');
  useSetupStore.setState(
    hardware.ok ? { hardware: hardware.data } : { hardware: null, hardwareFailed: true },
  );
}

export async function updateCatalog(): Promise<void> {
  const result = await window.kestrel.invoke('setup:updateCatalog');
  if (!result.ok) {
    notifyError(t('setup.updateCatalog'), result.error);
    return;
  }
  useSetupStore.setState({ catalog: result.data.catalog });
  notify('info', result.data.updated ? t('setup.catalogUpdated') : t('setup.catalogCurrent'));
}

export async function loadInstallPlan(): Promise<void> {
  if (useSetupStore.getState().plan !== undefined) return;
  const result = await window.kestrel.invoke('setup:installPlan');
  if (result.ok) useSetupStore.setState({ plan: result.data });
  else {
    useSetupStore.setState({ plan: null });
    notifyError(t('setup.install'), result.error);
  }
}

export async function installOllama(): Promise<void> {
  const taskId = crypto.randomUUID();
  useSetupStore.setState({ installTask: taskId, installStarted: false });
  const result = await window.kestrel.invoke('setup:installOllama', { taskId });
  if (!result.ok) {
    notifyError(t('setup.install'), result.error);
    return;
  }
  useSetupStore.setState({ installStarted: result.data.started });
}

export async function pullModel(model: string): Promise<void> {
  const taskId = crypto.randomUUID();
  useSetupStore.setState((state) => ({ pulls: { ...state.pulls, [model]: taskId } }));
  const result = await window.kestrel.invoke('setup:pullModel', { taskId, model });
  if (!result.ok) notifyError(t('setup.download'), result.error);
  await refreshOllama();
}

export async function cancelTask(taskId: string): Promise<void> {
  await window.kestrel.invoke('setup:cancel', { taskId });
}

/** Measures the models one after another (each loads into memory first). */
export async function runBenchmarks(
  models: readonly { model: string; purpose: ModelPurpose }[],
): Promise<void> {
  useSetupStore.setState({ benchmarking: true });
  for (const { model, purpose } of models) {
    const result = await window.kestrel.invoke('setup:benchmark', { model, purpose });
    if (result.ok) {
      useSetupStore.setState((state) => ({
        benchmarks: { ...state.benchmarks, [model]: result.data },
      }));
    } else {
      notifyError(t('setup.speedTitle'), result.error);
    }
  }
  useSetupStore.setState({ benchmarking: false });
}

/** Uses the downloaded models and closes the assistant. */
export async function finishSetup(choice: {
  completion: string | null;
  chat: string | null;
}): Promise<void> {
  const result = await window.kestrel.invoke('setup:apply', choice);
  if (!result.ok) {
    notifyError(t('setup.finish'), result.error);
    return;
  }
  await refreshProviders();
  closeModal();
  if (choice.chat || choice.completion) notify('success', t('setup.applied'));
}

/** Closing or skipping: the assistant does not open by itself again. */
export function skipSetup(): void {
  closeModal();
  if (!useSettingsStore.getState().settings.setupDone) {
    void useSettingsStore.getState().update({ setupDone: true });
  }
}
