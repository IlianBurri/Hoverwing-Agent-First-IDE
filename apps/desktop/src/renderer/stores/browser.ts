import { create } from 'zustand';
import type { BrowserState } from '@kestrel/shared';

export const useBrowserStore = create<{ tabs: Record<string, BrowserState> }>()(() => ({
  tabs: {},
}));

export function setBrowserState(state: BrowserState): void {
  useBrowserStore.setState((current) => ({ tabs: { ...current.tabs, [state.tabId]: state } }));
}

export function forgetBrowserTab(tabId: string): void {
  useBrowserStore.setState((current) => {
    const tabs = Object.fromEntries(Object.entries(current.tabs).filter(([id]) => id !== tabId));
    return { tabs };
  });
}

/** Editor tab id of a browser tab. */
export const browserTabPath = (tabId: string) => `browser:${tabId}`;

/** Short tab title: page title, else host, else "New tab". */
export function browserTitle(state: BrowserState | undefined, fallback: string): string {
  if (state?.title && state.title !== state.url) return state.title;
  try {
    return state?.url ? new URL(state.url).host || fallback : fallback;
  } catch {
    return fallback;
  }
}
