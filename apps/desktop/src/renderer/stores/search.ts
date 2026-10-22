import { create } from 'zustand';
import type { SearchOptions, SearchResult } from '@kestrel/shared';

export type SearchStatus = 'idle' | 'searching' | 'done' | 'error';

interface SearchState {
  options: SearchOptions;
  replacement: string;
  showReplace: boolean;
  showDetails: boolean;
  status: SearchStatus;
  result: SearchResult | null;
  /** Translated error text, e.g. for an invalid regular expression. */
  error: string | null;
  collapsed: ReadonlySet<string>;
  /** Incremented to ask the search input to take focus. */
  focusRequest: number;
}

export const useSearchStore = create<SearchState>()(() => ({
  options: {
    query: '',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    include: '',
    exclude: '',
  },
  replacement: '',
  showReplace: false,
  showDetails: false,
  status: 'idle',
  result: null,
  error: null,
  collapsed: new Set(),
  focusRequest: 0,
}));

export function requestSearchFocus(): void {
  useSearchStore.setState((state) => ({ focusRequest: state.focusRequest + 1 }));
}

export function countMatches(result: SearchResult | null): number {
  return result?.files.reduce((sum, file) => sum + file.matches.length, 0) ?? 0;
}
