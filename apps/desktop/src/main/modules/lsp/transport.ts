import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Duplex, Readable, Writable } from 'node:stream';

/** A running language server: its stdio streams and process lifecycle. */
export interface LspTransport {
  /** Server -> client (the server's stdout). */
  input: Readable;
  /** Client -> server (the server's stdin). */
  output: Writable;
  onStderr(listener: (line: string) => void): void;
  /** Called once when the server process ends. */
  onExit(listener: (code: number | null) => void): void;
  kill(): void;
}

export interface LspSpawnOptions {
  command: string;
  args: readonly string[];
  cwd: string;
  env: Record<string, string>;
}

export type StartLspTransport = (options: LspSpawnOptions) => Promise<LspTransport>;

/** Starts the server as a child process speaking LSP over stdin/stdout. */
export const spawnLspTransport: StartLspTransport = (options) =>
  new Promise((resolve, reject) => {
    // On Windows, "npx" is a .cmd script that needs its extension.
    const command =
      process.platform === 'win32' && !/\.(exe|cmd|bat)$/i.test(options.command)
        ? `${options.command}.cmd`
        : options.command;
    const child = spawn(command, [...options.args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      resolve({
        input: child.stdout,
        output: child.stdin,
        onStderr: (listener) => {
          createInterface({ input: child.stderr }).on('line', listener);
        },
        onExit: (listener) => {
          child.once('exit', (code) => {
            listener(code);
          });
        },
        kill: () => {
          if (child.exitCode !== null || child.signalCode !== null) return;
          child.kill('SIGTERM');
          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          }, 2000).unref();
        },
      });
    });
  });

/** Wraps a pair of in-memory streams (for tests). */
export function streamTransport(
  input: Readable,
  output: Writable,
  closeServer: () => void,
): LspTransport {
  const exitListeners: ((code: number | null) => void)[] = [];
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    for (const listener of exitListeners) listener(0);
  };
  input.once('close', end);
  input.once('end', end);
  return {
    input,
    output,
    onStderr: () => undefined,
    onExit: (listener) => {
      exitListeners.push(listener);
    },
    kill: () => {
      closeServer();
      (input as Duplex).destroy();
      end();
    },
  };
}
