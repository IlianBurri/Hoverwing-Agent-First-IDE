import { spawn } from 'node-pty';
import type { SpawnPty } from './manager';

export { createTerminalHandlers } from './handlers';
export { TerminalManager } from './manager';
export type { PtyProcess } from './manager';

/** Starts a real pseudo terminal with node-pty. */
export const spawnNodePty: SpawnPty = (shell, options) =>
  spawn(shell.file, shell.args, { name: 'xterm-256color', ...options });
