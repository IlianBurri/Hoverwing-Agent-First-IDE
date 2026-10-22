import { create } from 'zustand';
import type { StatusKind } from '../components/StatusMessage';

export interface Toast {
  id: number;
  kind: StatusKind;
  message: string;
}

interface ToastState {
  toasts: readonly Toast[];
}

export const useToastStore = create<ToastState>()(() => ({ toasts: [] }));

const DISMISS_AFTER_MS = 6000;
const MAX_VISIBLE = 4;
let nextId = 1;

export function dismissToast(id: number): void {
  useToastStore.setState((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
}

/** Shows a short message in the corner. Errors stay until dismissed. */
export function notify(kind: StatusKind, message: string): void {
  const id = nextId++;
  useToastStore.setState((state) => ({
    toasts: [...state.toasts, { id, kind, message }].slice(-MAX_VISIBLE),
  }));
  if (kind !== 'error') {
    window.setTimeout(() => {
      dismissToast(id);
    }, DISMISS_AFTER_MS);
  }
}
