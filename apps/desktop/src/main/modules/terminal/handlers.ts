import { homedir } from 'node:os';
import { app } from 'electron';
import type { ModuleHandlers } from '../../ipc/handlers';
import type { WorkspaceManager } from '../workspace';
import type { TerminalManager } from './manager';
import { defaultShell, terminalEnv } from './shell';

export function createTerminalHandlers(
  terminals: TerminalManager,
  workspaces: WorkspaceManager,
): ModuleHandlers<'terminal'> {
  return {
    'terminal:create': ({ cols, rows }, { sender }) => {
      // Terminals start in the project folder, or in the home folder.
      const cwd = workspaces.get(sender.id)?.root ?? homedir();
      const shell = defaultShell(process.platform, process.env);
      const id = terminals.create(sender.id, shell, {
        cwd,
        cols,
        rows,
        env: terminalEnv(process.env, app.getVersion()),
      });
      return { id, shell: shell.file, cwd };
    },
    'terminal:write': ({ id, data }, { sender }) => {
      terminals.write(sender.id, id, data);
      return null;
    },
    'terminal:resize': ({ id, cols, rows }, { sender }) => {
      terminals.resize(sender.id, id, cols, rows);
      return null;
    },
    'terminal:kill': ({ id }, { sender }) => {
      terminals.kill(sender.id, id);
      return null;
    },
  };
}
