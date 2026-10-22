import type { ThemePreference } from '@kestrel/shared';

export type { ThemePreference };
export type ResolvedTheme = 'dark' | 'light';

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

const order: readonly ThemePreference[] = ['dark', 'light', 'system'];

/** dark -> light -> system -> dark */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  return order[(order.indexOf(current) + 1) % order.length] ?? 'dark';
}
