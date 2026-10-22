import { Plus, Trash2 } from 'lucide-react';
import type { ParseKeys } from 'i18next';
import { i18next } from '../../i18n';
import { setPanelOpen } from '../../stores/layout';
import { useSettingsStore } from '../../stores/settings';
import { useTerminalStore } from '../../stores/terminal';
import { registerCommands } from '../commands';
import type { Command } from '../commands';
import { createTerminal, killTerminal } from './actions';

const t =
  (key: ParseKeys): (() => string) =>
  () =>
    i18next.t(key);

function showTerminalPanel() {
  const { settings, update } = useSettingsStore.getState();
  setPanelOpen('bottom', true);
  if (settings.layout.bottomView !== 'terminal') {
    void update({ layout: { ...settings.layout, bottomView: 'terminal' } });
  }
}

export function registerTerminalCommands(): () => void {
  const category = t('commands.category.terminal');
  const commands: Command[] = [
    {
      id: 'terminal.new',
      category,
      title: t('terminal.new'),
      icon: Plus,
      keybinding: 'Ctrl+Shift+`',
      run: async () => {
        showTerminalPanel();
        await createTerminal();
      },
    },
    {
      id: 'terminal.kill',
      category,
      title: t('terminal.kill'),
      icon: Trash2,
      when: () => useTerminalStore.getState().active !== null,
      run: async () => {
        const { active } = useTerminalStore.getState();
        if (active) await killTerminal(active);
      },
    },
  ];
  return registerCommands(commands);
}

export { showTerminalPanel };
