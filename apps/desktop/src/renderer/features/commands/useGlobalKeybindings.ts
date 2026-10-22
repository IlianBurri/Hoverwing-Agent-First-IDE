import { useEffect } from 'react';
import { useAppStore } from '../../stores/app';
import { useSettingsStore } from '../../stores/settings';
import { findCommandForEvent, runCommand, useCommandStore } from './registry';

/**
 * One window-level listener (capture phase, so it also works while focus is
 * inside the editor or terminal) that runs the command bound to a shortcut.
 */
export function useGlobalKeybindings(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.isComposing) return;
      const platform = useAppStore.getState().info?.platform ?? 'other';
      const overrides = useSettingsStore.getState().settings.keybindings;
      const commands = useCommandStore.getState().commands.values();
      const command = findCommandForEvent(event, commands, overrides, platform);
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      void runCommand(command.id);
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, []);
}
