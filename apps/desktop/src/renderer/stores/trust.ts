import { create } from 'zustand';

interface TrustState {
  /** null: no folder open (or not loaded yet). */
  trusted: boolean | null;
}

export const useTrustStore = create<TrustState>()(() => ({ trusted: null }));

export function setTrusted(trusted: boolean | null): void {
  useTrustStore.setState({ trusted });
}

export function isTrusted(): boolean {
  return useTrustStore.getState().trusted === true;
}
