import { defaultSettings, settingsSchema } from '@kestrel/shared';
import type { Settings } from '@kestrel/shared';

type SettingsKey = keyof Settings;
const keys = Object.keys(defaultSettings) as SettingsKey[];

/**
 * Turns whatever is in the settings file into valid settings.
 * Each top-level key is validated on its own, so one broken value
 * (e.g. edited by hand) only resets that key, not everything.
 */
export function parseSettings(raw: unknown): Settings {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const parsed = settingsSchema.shape[key].safeParse(source[key]);
    result[key] = parsed.success ? parsed.data : defaultSettings[key];
  }
  // Every key was validated individually above.
  return result as Settings;
}
