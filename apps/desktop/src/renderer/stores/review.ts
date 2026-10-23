import { create } from 'zustand';
import type { ReviewFile } from '@kestrel/shared';

export const useReviewStore = create<{ files: readonly ReviewFile[]; version: number }>()(() => ({
  files: [],
  version: 0,
}));

export async function refreshReview(): Promise<void> {
  const result = await window.kestrel.invoke('review:list');
  useReviewStore.setState((state) => ({
    files: result.ok ? result.data : [],
    // Open review tabs reload their diff when this changes.
    version: state.version + 1,
  }));
}
