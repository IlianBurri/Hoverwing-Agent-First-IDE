import { UserError } from '../../ipc/errors';
import { OutputBatcher } from './batcher';
import type { ShellCommand } from './shell';

/** The parts of a node-pty process we use (injectable for tests). */
export interface PtyProcess {
  onData: (listener: (data: string) => void) => void;
  onExit: (listener: (event: { exitCode: number }) => void) => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
}

export type SpawnPty = (
  shell: ShellCommand,
  options: { cwd: string; cols: number; rows: number; env: Record<string, string> },
) => PtyProcess;

export interface TerminalEvents {
  onData(ownerId: number, id: string, data: string): void;
  onExit(ownerId: number, id: string, exitCode: number): void;
}

interface Session {
  ownerId: number;
  pty: PtyProcess;
  output: OutputBatcher;
}

/**
 * All interactive terminals. Each belongs to the window that created it;
 * other windows cannot write to or resize it.
 */
export class TerminalManager {
  private readonly sessions = new Map<string, Session>();
  private nextId = 1;

  constructor(
    private readonly spawnPty: SpawnPty,
    private readonly events: TerminalEvents,
  ) {}

  create(
    ownerId: number,
    shell: ShellCommand,
    options: { cwd: string; cols: number; rows: number; env: Record<string, string> },
  ): string {
    return this.attach(ownerId, this.spawnPty(shell, options));
  }

  /** Registers a terminal that was started elsewhere (e.g. in a container). */
  attach(ownerId: number, pty: PtyProcess): string {
    const id = `t${String(this.nextId++)}`;
    const output = new OutputBatcher((data) => {
      this.events.onData(ownerId, id, data);
    });
    this.sessions.set(id, { ownerId, pty, output });
    pty.onData((data) => {
      output.push(data);
    });
    pty.onExit(({ exitCode }) => {
      output.flush();
      this.sessions.delete(id);
      this.events.onExit(ownerId, id, exitCode);
    });
    return id;
  }

  private owned(ownerId: number, id: string): Session {
    const session = this.sessions.get(id);
    if (session?.ownerId !== ownerId) throw new UserError('not_found', 'Terminal not found.');
    return session;
  }

  write(ownerId: number, id: string, data: string): void {
    this.owned(ownerId, id).pty.write(data);
  }

  resize(ownerId: number, id: string, cols: number, rows: number): void {
    this.owned(ownerId, id).pty.resize(cols, rows);
  }

  kill(ownerId: number, id: string): void {
    const session = this.owned(ownerId, id);
    session.output.flush();
    session.pty.kill();
    this.sessions.delete(id);
  }

  killAll(ownerId?: number): void {
    for (const [id, session] of this.sessions) {
      if (ownerId === undefined || session.ownerId === ownerId) {
        session.pty.kill();
        this.sessions.delete(id);
      }
    }
  }

  count(ownerId: number): number {
    return [...this.sessions.values()].filter((session) => session.ownerId === ownerId).length;
  }
}
