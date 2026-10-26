import { create } from 'zustand';
import type { McpServerStatus, McpServerView } from '@kestrel/shared';
import type { LogLine } from './agent';

interface McpState {
  servers: readonly McpServerView[];
  statuses: readonly McpServerStatus[];
  log: readonly LogLine[];
}

export const useMcpStore = create<McpState>()(() => ({ servers: [], statuses: [], log: [] }));

const MAX_LOG_LINES = 1000;

export function appendMcpLog(line: LogLine): void {
  useMcpStore.setState((state) => ({ log: [...state.log, line].slice(-MAX_LOG_LINES) }));
}

export function statusOf(
  statuses: readonly McpServerStatus[],
  server: Pick<McpServerView, 'id' | 'scope'>,
): McpServerStatus | undefined {
  return statuses.find((status) => status.id === server.id && status.scope === server.scope);
}
