import { z } from 'zod';
import { completionSettingsSchema, defaultCompletionSettings } from './completion';
import { modelRefSchema } from './providers';
import { DEFAULT_SANDBOX_BASE_IMAGE, imageReferenceSchema } from './sandbox';

export const themePreferenceSchema = z.enum(['dark', 'light', 'system']);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const languageSchema = z.enum(['de', 'en']);
export type Language = z.infer<typeof languageSchema>;

/** Panel sizes of one resizable group, keyed by panel id, in percent. */
export const panelLayoutSchema = z.record(z.string().max(50), z.number().min(0).max(100));

export const sidebarViewSchema = z.enum(['files', 'search', 'docker', 'mcp', 'models']);
export type SidebarView = z.infer<typeof sidebarViewSchema>;

export const bottomViewSchema = z.enum(['terminal', 'logs', 'problems', 'docker']);
export type BottomView = z.infer<typeof bottomViewSchema>;

export const layoutSettingsSchema = z.object({
  groups: z.record(z.string().max(50), panelLayoutSchema),
  sidebarView: sidebarViewSchema,
  bottomView: bottomViewSchema,
});
export type LayoutSettings = z.infer<typeof layoutSettingsSchema>;

/** User overrides: command id -> key combination, e.g. "Mod+Shift+P". */
export const keybindingsSchema = z.record(z.string().max(100), z.string().max(50));

export const settingsSchema = z.object({
  theme: themePreferenceSchema,
  /** null = follow the system language. */
  language: languageSchema.nullable(),
  layout: layoutSettingsSchema,
  keybindings: keybindingsSchema,
  /** Absolute paths, most recent first. Written by the main process only. */
  recentWorkspaces: z.array(z.string().max(4096)).max(10),
  /** Base image of the agent sandbox (e.g. a mirror of node:22-bookworm-slim). */
  sandboxBaseImage: imageReferenceSchema,
  /** Provider and model of the built-in chat (null = none chosen). */
  chatModel: modelRefSchema.nullable(),
  completion: completionSettingsSchema,
  /** The setup assistant was finished or skipped (it opens on first start otherwise). */
  setupDone: z.boolean(),
  /** Look for a new Kestrel version on start (installed app only). */
  checkForUpdates: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

/** What the renderer may change. Recent workspaces are managed by main. */
export const settingsPatchSchema = settingsSchema.omit({ recentWorkspaces: true }).partial();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const defaultSettings: Settings = {
  theme: 'dark',
  language: null,
  layout: {
    groups: {},
    sidebarView: 'files',
    bottomView: 'terminal',
  },
  keybindings: {},
  recentWorkspaces: [],
  sandboxBaseImage: DEFAULT_SANDBOX_BASE_IMAGE,
  chatModel: null,
  completion: defaultCompletionSettings,
  setupDone: false,
  checkForUpdates: true,
};

/** Applies a patch; keys that are missing or undefined stay unchanged. */
export function applySettingsPatch(
  settings: Settings,
  patch: { [K in keyof Settings]?: Settings[K] | undefined },
): Settings {
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<Settings>;
  return { ...settings, ...defined };
}
