import { useEffect } from 'react';
import { useAppStore } from '../../stores/app';
import { useSettingsStore } from '../../stores/settings';
import { findCommandForEvent, runCommand, useCommandStore } from './registry';

/**
 * In a terminal, Ctrl+letter belongs to the shell (Ctrl+C interrupt, Ctrl+R
 * history search, Ctrl+W delete word, …). On macOS the IDE uses Cmd, so
 * there is no conflict there.
 */
export function belongsToShell(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'code'>,
  inTerminal: boolean,
  platform: string,
): boolean {
  if (!inTerminal || platform === 'darwin') return false;
  return (
    event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !event.metaKey &&
    /^Key[A-Z]$/.test(event.code)
  );
}

/**
 * One window-level listener (capture phase, so it also works while focus is
 * inside the editor or terminal) that runs the command bound to a shortcut.
 */
export function useGlobalKeybindings(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.isComposing) return;
      const platform = useAppStore.getState().info?.platform ?? 'other';
      const inTerminal =
        event.target instanceof Element && event.target.closest('[data-terminal]') !== null;
      if (belongsToShell(event, inTerminal, platform)) return;
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
