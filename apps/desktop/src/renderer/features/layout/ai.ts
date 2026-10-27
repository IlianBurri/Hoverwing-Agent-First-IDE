import { create } from 'zustand';
import type { IpcError, LayoutState } from '@kestrel/shared';
import { applyPanelState } from '../../stores/layout';
import { useSettingsStore } from '../../stores/settings';
import { notify } from '../../stores/toasts';
import { i18next } from '../../i18n';
import { useCommandStore } from '../commands';

interface LayoutAiState {
  /** The layout before the last AI change (for "Undo"). */
  previous: LayoutState | null;
}

export const useLayoutAiStore = create<LayoutAiState>()(() => ({ previous: null }));

export function currentLayoutState(): LayoutState {
  const { workbench, toolbar, layout } = useSettingsStore.getState().settings;
  return {
    workbench,
    toolbar: [...toolbar],
    sidebarView: layout.sidebarView,
    bottomView: layout.bottomView,
  };
}

export type Proposal =
  | { ok: true; layout: LayoutState; explanation: string; model: string }
  | { ok: false; error: IpcError };

/** Asks the chat model; main checks the answer. Nothing changes yet. */
export async function proposeLayout(text: string): Promise<Proposal> {
  const commands = [...useCommandStore.getState().commands.values()]
    .filter((command) => command.showInPalette !== false)
    .map((command) => {
      const category = command.category?.();
      return {
        id: command.id,
        title: (category ? `${category}: ${command.title()}` : command.title()).slice(0, 200),
      };
    })
    .slice(0, 500);
  const result = await window.kestrel.invoke('layout:propose', { text, commands });
  return result.ok ? { ok: true, ...result.data } : { ok: false, error: result.error };
}

async function setLayoutState(state: LayoutState): Promise<void> {
  const { settings, update } = useSettingsStore.getState();
  await update({
    workbench: state.workbench,
    toolbar: state.toolbar,
    layout: { ...settings.layout, sidebarView: state.sidebarView, bottomView: state.bottomView },
  });
  // Panels are re-ordered first; open/close afterwards.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      applyPanelState(state.workbench.panels);
    });
  });
}

export async function applyAiLayout(state: LayoutState): Promise<void> {
  useLayoutAiStore.setState({ previous: currentLayoutState() });
  await setLayoutState(state);
}

/** Restores the layout from before the last AI change. */
export async function undoAiLayout(): Promise<void> {
  const { previous } = useLayoutAiStore.getState();
  if (!previous) return;
  useLayoutAiStore.setState({ previous: null });
  await setLayoutState(previous);
  notify('info', i18next.t('layout.ai.undone'));
}
