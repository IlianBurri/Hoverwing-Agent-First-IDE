import { create } from 'zustand';
import { applySettingsPatch, defaultSettings } from '@kestrel/shared';
import type { Settings, SettingsPatch } from '@kestrel/shared';

interface SettingsState {
  settings: Settings;
  /** Last save error, shown in the UI; null when everything is saved. */
  saveError: string | null;
  replace: (settings: Settings) => void;
  update: (patch: SettingsPatch) => Promise<void>;
}

/**
 * Renderer copy of the settings. The main process owns the file; this store
 * applies changes optimistically and syncs with what main confirms.
 */
export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: defaultSettings,
  saveError: null,
  replace: (settings) => {
    set({ settings });
  },
  update: async (patch) => {
    const previous = get().settings;
    set({ settings: applySettingsPatch(previous, patch) });
    const result = await window.kestrel.invoke('settings:update', patch);
    if (result.ok) {
      set({ settings: result.data, saveError: null });
    } else {
      set({ settings: previous, saveError: result.error.message });
    }
  },
}));

/** Keeps the store in sync when main reports changes (e.g. another window). */
export function subscribeToSettingsChanges(): () => void {
  return window.kestrel.on('settings:changed', (settings) => {
    useSettingsStore.getState().replace(settings);
  });
}
