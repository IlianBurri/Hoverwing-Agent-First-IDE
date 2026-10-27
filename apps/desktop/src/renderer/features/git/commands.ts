import {
  ArrowDownToLine,
  ArrowUpFromLine,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  RefreshCcwDot,
} from 'lucide-react';
import { i18next } from '../../i18n';
import { useGitStore } from '../../stores/git';
import { useTrustStore } from '../../stores/trust';
import { registerCommands } from '../commands';
import { commit, createBranch, fetch, pull, push, showGitView } from './actions';

const inRepo = () => useGitStore.getState().status?.state === 'repo';
const canWrite = () => inRepo() && useTrustStore.getState().trusted === true;

export function registerGitCommands(): () => void {
  const category = () => i18next.t('commands.category.git');
  return registerCommands([
    {
      id: 'git.show',
      category,
      title: () => i18next.t('git.show'),
      icon: GitBranch,
      keybinding: 'Mod+Shift+G',
      run: showGitView,
    },
    {
      id: 'git.commit',
      category,
      title: () => i18next.t('git.commit'),
      icon: GitCommitHorizontal,
      when: () => canWrite() && useGitStore.getState().message.trim() !== '',
      run: commit,
    },
    {
      id: 'git.createBranch',
      category,
      title: () => i18next.t('git.newBranch'),
      icon: GitBranchPlus,
      when: canWrite,
      run: createBranch,
    },
    {
      id: 'git.fetch',
      category,
      title: () => i18next.t('git.fetch'),
      icon: RefreshCcwDot,
      when: canWrite,
      run: fetch,
    },
    {
      id: 'git.pull',
      category,
      title: () => i18next.t('git.pull'),
      icon: ArrowDownToLine,
      when: canWrite,
      run: pull,
    },
    {
      id: 'git.push',
      category,
      title: () => i18next.t('git.push'),
      icon: ArrowUpFromLine,
      when: canWrite,
      run: push,
    },
  ]);
}
