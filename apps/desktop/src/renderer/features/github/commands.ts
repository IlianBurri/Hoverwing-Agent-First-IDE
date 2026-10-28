import { FolderGit2, LogOut } from 'lucide-react';
import { i18next } from '../../i18n';
import { useGitHubStore } from '../../stores/github';
import { registerCommands } from '../commands';
import { showGitHub, signOutOfGitHub } from './actions';

export function registerGitHubCommands(): () => void {
  const category = () => i18next.t('commands.category.github');
  return registerCommands([
    {
      id: 'github.repositories',
      category,
      title: () => i18next.t('github.open'),
      icon: FolderGit2,
      run: showGitHub,
    },
    {
      id: 'github.signOut',
      category,
      title: () => i18next.t('github.signOut'),
      icon: LogOut,
      when: () => useGitHubStore.getState().status?.user != null,
      run: () => void signOutOfGitHub(),
    },
  ]);
}
