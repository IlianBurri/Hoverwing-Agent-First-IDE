import { create } from 'zustand';
import type { ModelErrorKind, ModelRef, ProviderView } from '@kestrel/shared';

/** Result of the last connection test of a provider. */
export type ProviderTest =
  | { state: 'testing' }
  | { state: 'ok'; models: readonly string[] }
  | { state: 'error'; message: string };

interface ProvidersState {
  providers: readonly ProviderView[];
  tests: Readonly<Record<string, ProviderTest>>;
  /** Why the last inline suggestion failed (null = fine). */
  completionError: ModelErrorKind | null;
}

export const useProvidersStore = create<ProvidersState>()(() => ({
  providers: [],
  tests: {},
  completionError: null,
}));

/** Every provider/model pair, for model pickers. */
export function modelRefs(providers: readonly ProviderView[]): ModelRef[] {
  return providers.flatMap((provider) =>
    provider.models.map((model) => ({ providerId: provider.id, model })),
  );
}

export function refKey(ref: ModelRef): string {
  return `${ref.providerId}/${ref.model}`;
}

export function parseRefKey(key: string): ModelRef | null {
  const slash = key.indexOf('/');
  if (slash <= 0) return null;
  return { providerId: key.slice(0, slash), model: key.slice(slash + 1) };
}
