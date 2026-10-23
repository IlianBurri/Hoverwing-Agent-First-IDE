import type { ModuleHandlers } from '../../ipc/handlers';
import { UserError } from '../../ipc/errors';
import type { TerminalManager } from '../terminal';
import { SANDBOX_HOME } from './plan';
import type { SandboxService } from './service';

export function createSandboxHandlers(
  sandbox: SandboxService,
  terminals: TerminalManager,
  agentExists: (agentId: string) => Promise<boolean>,
): ModuleHandlers<'sandbox'> {
  return {
    'sandbox:status': () => sandbox.status(),
    'sandbox:prepare': () => sandbox.prepare(),
    'sandbox:loginTerminal': async ({ agentId, cols, rows }, { sender }) => {
      if (!(await agentExists(agentId))) throw new UserError('not_found', 'Unknown agent.');
      const pty = await sandbox.openLogin(agentId);
      pty.resize(cols, rows);
      const id = terminals.attach(sender.id, pty);
      return { id, shell: 'bash', cwd: SANDBOX_HOME };
    },
  };
}
