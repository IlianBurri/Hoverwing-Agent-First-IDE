import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { setGitHubStatus, useGitHubStore } from '../../stores/github';
import { openModal } from '../../stores/modals';
import { showOpenedWorkspace } from '../workspace';
import { closeAll } from '../editor';

const t = i18next.t.bind(i18next);

export async function loadGitHubStatus(): Promise<void> {
  const result = await window.kestrel.invoke('github:status');
  if (result.ok) setGitHubStatus(result.data);
}

export function showGitHub(): void {
  openModal({ id: 'github' });
  void loadGitHubStatus();
}

/** Starts the device flow; main opens GitHub's code page in the browser. */
export async function signInToGitHub(): Promise<void> {
  const result = await window.kestrel.invoke('github:signIn');
  if (!result.ok) notifyError(t('github.signIn'), result.error);
  await loadGitHubStatus();
}

export async function cancelGitHubSignIn(): Promise<void> {
  await window.kestrel.invoke('github:cancelSignIn');
}

export async function signOutOfGitHub(): Promise<void> {
  const result = await window.kestrel.invoke('github:signOut');
  if (!result.ok) notifyError(t('github.signOut'), result.error);
  useGitHubStore.setState({ repos: null });
}

export async function loadGitHubRepos(): Promise<void> {
  useGitHubStore.setState({ loadingRepos: true });
  const result = await window.kestrel.invoke('github:repos');
  useGitHubStore.setState({ loadingRepos: false, repos: result.ok ? result.data : null });
  if (!result.ok) {
    notifyError(t('github.repos'), result.error);
    await loadGitHubStatus();
  }
}

export async function openVerificationPage(url: string): Promise<void> {
  await window.kestrel.invoke('app:openExternalUrl', { url });
}

export async function copyUserCode(code: string): Promise<void> {
  await window.kestrel.invoke('app:writeClipboard', { text: code });
}

/** Clones into a folder chosen natively and opens the copy in this window. */
export async function cloneGitHubRepo(fullName: string): Promise<boolean> {
  // Unsaved edits are offered for saving first, as when opening a folder.
  if (!(await closeAll())) return false;
  useGitHubStore.setState({ cloning: fullName });
  const result = await window.kestrel.invoke('github:clone', { fullName });
  useGitHubStore.setState({ cloning: null });
  if (!result.ok) {
    notifyError(t('github.clone'), result.error);
    return false;
  }
  if (!result.data) return false;
  showOpenedWorkspace(result.data);
  return true;
}
