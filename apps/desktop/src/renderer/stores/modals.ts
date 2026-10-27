import { create } from 'zustand';
import type { Checkpoint, GitDiff, McpServerView, ProviderView } from '@kestrel/shared';

/** The app-level modal that is open (one at a time), with its data. */
export type ModalState =
  | { id: 'permissionRules' }
  | { id: 'agents' }
  /** Add (server: null) or edit an MCP server. */
  | { id: 'mcpServer'; server: McpServerView | null }
  | { id: 'checkpointChanges'; checkpoint: Checkpoint }
  /** Add (provider: null) or edit a model provider. */
  | { id: 'provider'; provider: ProviderView | null }
  | { id: 'setup' }
  | { id: 'lspServers' }
  | { id: 'toolbar' }
  | { id: 'layout' }
  | { id: 'gitDiff'; path: string; staged: boolean; diff: GitDiff }
  | null;

export const useModalStore = create<{ open: ModalState }>()(() => ({ open: null }));

export function openModal(modal: NonNullable<ModalState>): void {
  useModalStore.setState({ open: modal });
}

export function closeModal(): void {
  useModalStore.setState({ open: null });
}
