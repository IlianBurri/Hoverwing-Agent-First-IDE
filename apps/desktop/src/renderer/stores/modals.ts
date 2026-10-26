import { create } from 'zustand';
import type { Checkpoint, McpServerView } from '@kestrel/shared';

/** The app-level modal that is open (one at a time), with its data. */
export type ModalState =
  | { id: 'permissionRules' }
  | { id: 'agents' }
  /** Add (server: null) or edit an MCP server. */
  | { id: 'mcpServer'; server: McpServerView | null }
  | { id: 'checkpointChanges'; checkpoint: Checkpoint }
  | null;

export const useModalStore = create<{ open: ModalState }>()(() => ({ open: null }));

export function openModal(modal: NonNullable<ModalState>): void {
  useModalStore.setState({ open: modal });
}

export function closeModal(): void {
  useModalStore.setState({ open: null });
}
