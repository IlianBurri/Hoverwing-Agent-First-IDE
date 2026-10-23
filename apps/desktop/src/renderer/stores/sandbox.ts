import { create } from 'zustand';
import type { SandboxStatus } from '@kestrel/shared';
import type { LogLine } from './agent';

interface SandboxState {
  /** null until the first check finished. */
  status: SandboxStatus | null;
  log: readonly LogLine[];
}

export const useSandboxStore = create<SandboxState>()(() => ({ status: null, log: [] }));

const MAX_LOG_LINES = 2000;

export function setSandboxStatus(status: SandboxStatus): void {
  useSandboxStore.setState({ status });
}

export function appendSandboxLog(line: LogLine): void {
  useSandboxStore.setState((state) => ({ log: [...state.log, line].slice(-MAX_LOG_LINES) }));
}

export function dockerAvailable(): boolean {
  return useSandboxStore.getState().status?.docker === 'available';
}
