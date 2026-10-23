import { create } from 'zustand';
import type { Checkpoint } from '@kestrel/shared';

/** The app-level modal that is open (one at a time), with its data. */
export type ModalState =
  | { id: 'permissionRules' }
  | { id: 'agents' }
  | { id: 'checkpointChanges'; checkpoint: Checkpoint }
  | null;

export const useModalStore = create<{ open: ModalState }>()(() => ({ open: null }));

export function openModal(modal: NonNullable<ModalState>): void {
  useModalStore.setState({ open: modal });
}

export function closeModal(): void {
  useModalStore.setState({ open: null });
}
