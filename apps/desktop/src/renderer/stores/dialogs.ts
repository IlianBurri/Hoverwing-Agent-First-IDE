import { create } from 'zustand';

export interface PromptOptions {
  title: string;
  label: string;
  initialValue?: string;
  /** Characters to pre-select, e.g. the name without extension. */
  selection?: [number, number];
  confirmLabel: string;
  /** Returns an error message, or null when the value is fine. */
  validate?: (value: string) => string | null;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** Destructive actions get a red button. */
  danger?: boolean;
}

export type DialogRequest = { id: number } & (
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
);

let nextId = 1;

interface DialogState {
  current: DialogRequest | null;
  /** Requests waiting while another dialog is open. */
  queue: DialogRequest[];
}

export const useDialogStore = create<DialogState>()(() => ({ current: null, queue: [] }));

function enqueue(request: DialogRequest): void {
  useDialogStore.setState((state) =>
    state.current ? { queue: [...state.queue, request] } : { current: request },
  );
}

/** Closes the current dialog and shows the next queued one. */
export function closeDialog(): void {
  useDialogStore.setState((state) => ({
    current: state.queue[0] ?? null,
    queue: state.queue.slice(1),
  }));
}

/** Asks for a text value; resolves to null when cancelled. */
export function prompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    enqueue({ id: nextId++, kind: 'prompt', options, resolve });
  });
}

/** Asks for confirmation; resolves to false when cancelled. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    enqueue({ id: nextId++, kind: 'confirm', options, resolve });
  });
}
