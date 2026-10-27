import { CircleAlert, RotateCw, Settings2 } from 'lucide-react';
import { i18next } from '../../i18n';
import { useWorkspaceStore } from '../../stores/workspace';
import { registerCommands } from '../commands';
import { openLspServers, restartLanguageServers, showProblems } from './actions';

export function registerLspCommands(): () => void {
  const category = () => i18next.t('commands.category.editor');
  return registerCommands([
    {
      id: 'lsp.showProblems',
      category,
      title: () => i18next.t('lsp.showProblems'),
      icon: CircleAlert,
      keybinding: 'Mod+Shift+M',
      run: showProblems,
    },
    {
      id: 'lsp.restart',
      category,
      title: () => i18next.t('lsp.restart'),
      icon: RotateCw,
      when: () => useWorkspaceStore.getState().info !== null,
      run: restartLanguageServers,
    },
    {
      id: 'lsp.servers',
      category,
      title: () => i18next.t('lsp.servers'),
      icon: Settings2,
      run: openLspServers,
    },
  ]);
}
