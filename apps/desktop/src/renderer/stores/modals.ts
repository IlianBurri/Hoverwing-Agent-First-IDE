import { create } from 'zustand';

/** Which app-level modal is open (one at a time). */
export type ModalId = 'permissionRules';

export const useModalStore = create<{ open: ModalId | null }>()(() => ({ open: null }));

export function openModal(id: ModalId): void {
  useModalStore.setState({ open: id });
}

export function closeModal(): void {
  useModalStore.setState({ open: null });
}
