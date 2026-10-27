import { gitBranchNameSchema } from '@kestrel/shared';
import type { IpcResult } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { confirm, prompt } from '../../stores/dialogs';
import { setGitStatus, useGitStore } from '../../stores/git';
import { setPanelOpen } from '../../stores/layout';
import { openModal } from '../../stores/modals';
import { useSettingsStore } from '../../stores/settings';
import { notify } from '../../stores/toasts';
import { useWorkspaceStore } from '../../stores/workspace';

const t = i18next.t.bind(i18next);

export function showGitView(): void {
  const { settings, update } = useSettingsStore.getState();
  setPanelOpen('sidebar', true);
  if (settings.layout.sidebarView !== 'git') {
    void update({ layout: { ...settings.layout, sidebarView: 'git' } });
  }
}

let refreshing: Promise<void> | null = null;
let again = false;
/** Reads and clears the "refresh again" flag (a call, so TypeScript does not narrow it). */
function takeAgain(): boolean {
  const value = again;
  again = false;
  return value;
}

/** Loads status (and branches); overlapping calls collapse into one more run. */
export async function refreshGit(): Promise<void> {
  if (refreshing) {
    again = true;
    return refreshing;
  }
  refreshing = (async () => {
    do {
      if (!useWorkspaceStore.getState().info) {
        setGitStatus(null);
        useGitStore.setState({ branches: [] });
        continue;
      }
      const status = await window.kestrel.invoke('git:status');
      setGitStatus(status.ok ? status.data : null);
      if (status.ok && status.data.state === 'repo') {
        const branches = await window.kestrel.invoke('git:branches');
        useGitStore.setState({ branches: branches.ok ? branches.data : [] });
      }
    } while (takeAgain());
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Runs an action with the busy flag, shows errors, refreshes the status. */
async function run(action: string, call: () => Promise<IpcResult<null>>): Promise<boolean> {
  useGitStore.setState({ busy: true });
  try {
    const result = await call();
    if (!result.ok) {
      notifyError(action, result.error);
      return false;
    }
    return true;
  } finally {
    useGitStore.setState({ busy: false });
    await refreshGit();
  }
}

export const stage = (paths: string[]) =>
  run(t('git.stage'), () => window.kestrel.invoke('git:stage', { paths }));

export const unstage = (paths: string[]) =>
  run(t('git.unstage'), () => window.kestrel.invoke('git:unstage', { paths }));

export async function discard(paths: string[], untracked: number): Promise<void> {
  const confirmed = await confirm({
    title: t('git.discardTitle', { count: paths.length }),
    message: untracked > 0 ? t('git.discardMessageUntracked') : t('git.discardMessage'),
    confirmLabel: t('git.discard'),
    danger: true,
  });
  if (!confirmed) return;
  await run(t('git.discard'), () => window.kestrel.invoke('git:discard', { paths }));
}

export async function commit(): Promise<void> {
  const message = useGitStore.getState().message.trim();
  if (!message) return;
  if (await run(t('git.commit'), () => window.kestrel.invoke('git:commit', { message }))) {
    useGitStore.setState({ message: '' });
    notify('success', t('git.committed'));
  }
}

export async function checkout(branch: string): Promise<void> {
  await run(t('git.checkout'), () => window.kestrel.invoke('git:checkout', { branch }));
}

export async function createBranch(): Promise<void> {
  const name = await prompt({
    title: t('git.newBranch'),
    label: t('git.branchName'),
    confirmLabel: t('git.createBranch'),
    validate: (value) =>
      gitBranchNameSchema.safeParse(value.trim()).success ? null : t('git.invalidBranch'),
  });
  if (name === null) return;
  await run(t('git.createBranch'), () =>
    window.kestrel.invoke('git:createBranch', { name: name.trim() }),
  );
}

export async function initRepository(): Promise<void> {
  await run(t('git.init'), () => window.kestrel.invoke('git:init'));
}

export async function fetch(): Promise<void> {
  await run(t('git.fetch'), () => window.kestrel.invoke('git:fetch'));
}

export async function pull(): Promise<void> {
  await run(t('git.pull'), () => window.kestrel.invoke('git:pull'));
}

export async function push(): Promise<void> {
  const status = useGitStore.getState().status;
  const branch = status?.state === 'repo' ? (status.branch ?? '') : '';
  const confirmed = await confirm({
    title: t('git.pushTitle', { branch }),
    message:
      status?.state === 'repo' && status.upstream
        ? t('git.pushMessage', { upstream: status.upstream })
        : t('git.pushMessageNew'),
    confirmLabel: t('git.push'),
  });
  if (!confirmed) return;
  if (await run(t('git.push'), () => window.kestrel.invoke('git:push'))) {
    notify('success', t('git.pushed'));
  }
}

export async function openGitDiff(path: string, staged: boolean): Promise<void> {
  const result = await window.kestrel.invoke('git:diff', { path, staged });
  if (!result.ok) {
    notifyError(t('git.showDiff'), result.error);
    return;
  }
  openModal({ id: 'gitDiff', path, staged, diff: result.data });
}
