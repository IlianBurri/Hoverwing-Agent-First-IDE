import { Readable, Writable } from 'node:stream';
import { createInterface } from 'node:readline';
import { ndJsonStream } from '@agentclientprotocol/sdk';
import type { AgentTransport } from '../agent';
import type { AttachedContainer } from '../docker';
import type { PtyProcess } from '../terminal';

/** An agent in a container, speaking ACP over the container's stdin/stdout. */
export function containerTransport(container: AttachedContainer): AgentTransport {
  const stream = ndJsonStream(
    Writable.toWeb(container.stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(container.stdout) as ReadableStream<Uint8Array>,
  );
  let stopping: Promise<void> | null = null;
  return {
    stream,
    onStderr: (listener) => {
      createInterface({ input: container.stderr }).on('line', listener);
    },
    onExit: (listener) => {
      void container.wait().then(listener);
    },
    kill: () => {
      // The container removes itself once it stopped.
      stopping ??= container.stop().catch(() => undefined);
    },
  };
}

/** A container with a tty, shaped like a node-pty process for the terminal panel. */
export function containerPty(container: AttachedContainer): PtyProcess {
  container.stdout.setEncoding('utf8');
  return {
    onData: (listener) => {
      container.stdout.on('data', (data: string) => {
        listener(data);
      });
    },
    onExit: (listener) => {
      void container.wait().then((code) => {
        listener({ exitCode: code ?? 0 });
      });
    },
    write: (data) => {
      container.stdin.write(data);
    },
    resize: (cols, rows) => {
      void container.resize(cols, rows);
    },
    kill: () => {
      void container.stop().catch(() => undefined);
    },
  };
}
