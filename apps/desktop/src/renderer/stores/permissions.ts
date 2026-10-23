import { create } from 'zustand';
import type { AuditEntry, PermissionDecision, PermissionRequest } from '@kestrel/shared';

interface PermissionState {
  pending: readonly PermissionRequest[];
  /** Newest first; filled when the log view is opened, then live. */
  log: readonly AuditEntry[];
}

export const usePermissionStore = create<PermissionState>()(() => ({ pending: [], log: [] }));

export function addPending(request: PermissionRequest): void {
  usePermissionStore.setState((state) =>
    state.pending.some((entry) => entry.id === request.id)
      ? state
      : { pending: [...state.pending, request] },
  );
}

export function removePending(id: string): void {
  usePermissionStore.setState((state) => ({
    pending: state.pending.filter((entry) => entry.id !== id),
  }));
}

export function addLogEntry(entry: AuditEntry): void {
  usePermissionStore.setState((state) => ({ log: [entry, ...state.log].slice(0, 500) }));
}

export async function respond(id: string, decision: PermissionDecision): Promise<void> {
  // Remove right away; main confirms with "permissions:resolved".
  removePending(id);
  await window.kestrel.invoke('permissions:respond', { requestId: id, decision });
}

export async function loadLog(): Promise<void> {
  const result = await window.kestrel.invoke('permissions:log', { limit: 500 });
  if (result.ok) usePermissionStore.setState({ log: result.data });
}

export async function loadPending(): Promise<void> {
  const result = await window.kestrel.invoke('permissions:pending');
  if (result.ok) usePermissionStore.setState({ pending: result.data });
}
