import { baseName } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { removeSession, useTerminalStore } from '../../stores/terminal';

/** Initial size until the view measures itself and sends a resize. */
const INITIAL_SIZE = { cols: 80, rows: 24 };

export async function createTerminal(): Promise<void> {
  const result = await window.kestrel.invoke('terminal:create', INITIAL_SIZE);
  if (!result.ok) {
    notifyError(i18next.t('terminal.new'), result.error);
    return;
  }
  const { id, shell, cwd } = result.data;
  useTerminalStore.setState((state) => ({
    sessions: [
      ...state.sessions,
      { id, title: baseName(shell.replace(/\\/g, '/')), cwd, exitCode: null },
    ],
    active: id,
  }));
}

export async function killTerminal(id: string): Promise<void> {
  const session = useTerminalStore.getState().sessions.find((entry) => entry.id === id);
  if (session && session.exitCode === null) {
    await window.kestrel.invoke('terminal:kill', { id });
  }
  removeSession(id);
}

export async function ensureTerminal(): Promise<void> {
  if (useTerminalStore.getState().sessions.length === 0) await createTerminal();
}
