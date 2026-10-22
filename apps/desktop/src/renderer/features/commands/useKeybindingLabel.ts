import { useAppStore } from '../../stores/app';
import { useSettingsStore } from '../../stores/settings';
import { formatKeyCombo } from './keybindings';
import { effectiveKeybindings, useCommandStore } from './registry';

/** Display label of a command's current shortcut, or null if it has none. */
export function useKeybindingLabel(commandId: string): string | null {
  const platform = useAppStore((state) => state.info?.platform ?? 'other');
  const overrides = useSettingsStore((state) => state.settings.keybindings);
  const command = useCommandStore((state) => state.commands.get(commandId));
  if (!command) return null;
  const [combo] = effectiveKeybindings(command, overrides, platform);
  return combo ? formatKeyCombo(combo, platform) : null;
}
