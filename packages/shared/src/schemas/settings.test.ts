import { describe, expect, it } from 'vitest';
import {
  applySettingsPatch,
  defaultSettings,
  settingsPatchSchema,
  settingsSchema,
} from './settings';

describe('settings schema', () => {
  it('accepts the defaults', () => {
    expect(settingsSchema.parse(defaultSettings)).toEqual(defaultSettings);
  });

  it('does not let the renderer change recent workspaces', () => {
    const result = settingsPatchSchema.safeParse({ recentWorkspaces: ['/etc'] });
    // Unknown keys are stripped, so the patch becomes empty.
    expect(result.success && result.data).toEqual({});
  });

  it('rejects out-of-range panel sizes', () => {
    const patch = {
      layout: { ...defaultSettings.layout, groups: { main: { sidebar: 150 } } },
    };
    expect(settingsPatchSchema.safeParse(patch).success).toBe(false);
  });
});

describe('applySettingsPatch', () => {
  it('keeps keys that are undefined in the patch', () => {
    const next = applySettingsPatch(defaultSettings, { theme: undefined, language: 'en' });
    expect(next.theme).toBe(defaultSettings.theme);
    expect(next.language).toBe('en');
  });
});
