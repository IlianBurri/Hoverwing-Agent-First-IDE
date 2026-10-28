import { create } from 'zustand';
import type { GitHubRepo, GitHubStatus } from '@kestrel/shared';

interface GitHubState {
  status: GitHubStatus | null;
  repos: GitHubRepo[] | null;
  loadingRepos: boolean;
  /** "owner/name" being cloned, or null. */
  cloning: string | null;
}

export const useGitHubStore = create<GitHubState>()(() => ({
  status: null,
  repos: null,
  loadingRepos: false,
  cloning: null,
}));

export function setGitHubStatus(status: GitHubStatus): void {
  useGitHubStore.setState((state) => ({
    status,
    // Another account (or none): the old list does not belong to it.
    repos: status.user?.login === state.status?.user?.login ? state.repos : null,
  }));
}
