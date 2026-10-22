import { create } from 'zustand';

export interface TerminalSession {
  id: string;
  /** Shell name for the tab, e.g. "bash". */
  title: string;
  cwd: string;
  exitCode: number | null;
}

interface TerminalState {
  sessions: readonly TerminalSession[];
  active: string | null;
}

export const useTerminalStore = create<TerminalState>()(() => ({ sessions: [], active: null }));

type OutputListener = (data: string) => void;
const listeners = new Map<string, OutputListener>();
/** Output that arrived before the terminal view was mounted. */
const pending = new Map<string, string[]>();

/** Routes main-process output to the xterm instance of a session. */
export function subscribeOutput(id: string, listener: OutputListener): () => void {
  listeners.set(id, listener);
  for (const chunk of pending.get(id) ?? []) listener(chunk);
  pending.delete(id);
  return () => {
    if (listeners.get(id) === listener) listeners.delete(id);
  };
}

export function deliverOutput(id: string, data: string): void {
  const listener = listeners.get(id);
  if (listener) listener(data);
  else pending.set(id, [...(pending.get(id) ?? []), data]);
}

export function markExited(id: string, exitCode: number): void {
  useTerminalStore.setState((state) => ({
    sessions: state.sessions.map((session) =>
      session.id === id ? { ...session, exitCode } : session,
    ),
  }));
}

export function removeSession(id: string): void {
  pending.delete(id);
  useTerminalStore.setState((state) => {
    const index = state.sessions.findIndex((session) => session.id === id);
    const sessions = state.sessions.filter((session) => session.id !== id);
    const neighbour = sessions[index] ?? sessions[index - 1] ?? null;
    return { sessions, active: state.active === id ? (neighbour?.id ?? null) : state.active };
  });
}

/** Forgets all sessions (the main process already ended their shells). */
export function resetTerminals(): void {
  pending.clear();
  useTerminalStore.setState({ sessions: [], active: null });
}
