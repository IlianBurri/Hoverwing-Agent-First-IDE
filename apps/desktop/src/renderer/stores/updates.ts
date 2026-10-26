import { create } from 'zustand';
import type { UpdateStatus } from '@kestrel/shared';

/** The app update state from main (null until loaded). */
export const useUpdateStore = create<{ status: UpdateStatus | null }>()(() => ({ status: null }));

export function setUpdateStatus(status: UpdateStatus): void {
  useUpdateStore.setState({ status });
}
