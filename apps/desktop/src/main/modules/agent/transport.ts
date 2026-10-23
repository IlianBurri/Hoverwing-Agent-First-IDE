import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { createInterface } from 'node:readline';
import { ndJsonStream } from '@agentclientprotocol/sdk';
import type { AgentApp, AnyMessage, Stream } from '@agentclientprotocol/sdk';

/** A running agent: its ACP message stream and its process lifecycle. */
export interface AgentTransport {
  stream: Stream;
  /** Called for each line the agent writes to stderr (diagnostics). */
  onStderr(listener: (line: string) => void): void;
  /** Called once when the agent ends (exit code, or null when killed). */
  onExit(listener: (code: number | null) => void): void;
  kill(): void;
}

export interface SpawnOptions {
  command: string;
  args: readonly string[];
  cwd: string;
  env: Record<string, string>;
}

export type StartTransport = (options: SpawnOptions) => Promise<AgentTransport>;

/** An agent started somewhere else than on the host (the Docker sandbox). */
export interface IsolatedStart {
  start(): Promise<{ transport: AgentTransport; agentRoot: string }>;
}

/** Starts the agent as a child process speaking ACP over stdin/stdout. */
export const spawnTransport: StartTransport = (options) =>
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
      const stream = ndJsonStream(
        Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
        Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
      );
      resolve({
        stream,
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
          // Give the agent a moment to clean up, then force it.
          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          }, 2000).unref();
        },
      });
    });
  });

/** Connects to an agent app in the same process (for tests). */
export function inProcessTransport(agentApp: AgentApp): AgentTransport {
  const toAgent = new TransformStream<AnyMessage, AnyMessage>();
  const toClient = new TransformStream<AnyMessage, AnyMessage>();
  const connection = agentApp.connect({ writable: toClient.writable, readable: toAgent.readable });
  const exitListeners: ((code: number | null) => void)[] = [];
  void connection.closed.then(() => {
    for (const listener of exitListeners) listener(0);
  });
  return {
    stream: { writable: toAgent.writable, readable: toClient.readable },
    onStderr: () => undefined,
    onExit: (listener) => {
      exitListeners.push(listener);
    },
    kill: () => {
      connection.close();
    },
  };
}
