import { baseName } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { setSandboxStatus } from '../../stores/sandbox';
import { useTerminalStore } from '../../stores/terminal';
import { notify } from '../../stores/toasts';
import { showTerminalPanel } from '../terminal';

const t = i18next.t.bind(i18next);

export async function refreshSandboxStatus(): Promise<void> {
  const result = await window.kestrel.invoke('sandbox:status');
  if (result.ok) setSandboxStatus(result.data);
}

/** Builds the sandbox image; the build output goes to Logs › Sandbox. */
export async function prepareSandbox(): Promise<boolean> {
  const result = await window.kestrel.invoke('sandbox:prepare');
  if (!result.ok) {
    notifyError(t('sandbox.prepare'), result.error);
    await refreshSandboxStatus();
    return false;
  }
  setSandboxStatus(result.data);
  notify('success', t('sandbox.prepared'));
  return true;
}

/** Opens a terminal in the agent's sandbox, where the user logs in to the agent. */
export async function openLoginTerminal(agentId: string, agentName: string): Promise<void> {
  const result = await window.kestrel.invoke('sandbox:loginTerminal', {
    agentId,
    cols: 80,
    rows: 24,
  });
  if (!result.ok) {
    notifyError(t('sandbox.login'), result.error);
    return;
  }
  const { id, shell, cwd } = result.data;
  useTerminalStore.setState((state) => ({
    sessions: [
      ...state.sessions,
      {
        id,
        title: t('sandbox.loginTab', { agent: agentName, shell: baseName(shell) }),
        cwd,
        exitCode: null,
      },
    ],
    active: id,
  }));
  showTerminalPanel();
}
