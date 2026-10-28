import { z } from 'zod';
import { completionSettingsSchema, defaultCompletionSettings } from './completion';
import { modelOptionsSchema, modelRefSchema } from './providers';
import { DEFAULT_SANDBOX_BASE_IMAGE, imageReferenceSchema } from './sandbox';
import {
  bottomViewSchema,
  defaultWorkbench,
  layoutProfileSchema,
  sidebarViewSchema,
  workbenchSchema,
} from './workbench';

export const themePreferenceSchema = z.enum(['dark', 'light', 'system']);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const languageSchema = z.enum(['de', 'en']);
export type Language = z.infer<typeof languageSchema>;

/** Panel sizes of one resizable group, keyed by panel id, in percent. */
export const panelLayoutSchema = z.record(z.string().max(50), z.number().min(0).max(100));

export const layoutSettingsSchema = z.object({
  groups: z.record(z.string().max(50), panelLayoutSchema),
  sidebarView: sidebarViewSchema,
  bottomView: bottomViewSchema,
});
export type LayoutSettings = z.infer<typeof layoutSettingsSchema>;

/** Command ids shown as buttons in the title bar, in order. */
export const toolbarSchema = z.array(z.string().min(1).max(100)).max(30);
export const MAX_TOOLBAR_ITEMS = 30;
export const defaultToolbar: readonly string[] = ['git.pull', 'git.push'];

/** User overrides: command id -> key combination, e.g. "Mod+Shift+P". */
export const keybindingsSchema = z.record(z.string().max(100), z.string().max(50));

export const settingsSchema = z.object({
  theme: themePreferenceSchema,
  /** null = follow the system language. */
  language: languageSchema.nullable(),
  layout: layoutSettingsSchema,
  keybindings: keybindingsSchema,
  toolbar: toolbarSchema,
  /** Arrangement of panels, bars and tabs. */
  workbench: workbenchSchema,
  /** Layouts the user saved (the shipped ones are not stored). */
  layoutProfiles: z.array(layoutProfileSchema).max(20),
  /** Absolute paths, most recent first. Written by the main process only. */
  recentWorkspaces: z.array(z.string().max(4096)).max(10),
  /** Base image of the agent sandbox (e.g. a mirror of node:22-bookworm-slim). */
  sandboxBaseImage: imageReferenceSchema,
  /** Provider and model of the built-in chat (null = none chosen). */
  chatModel: modelRefSchema.nullable(),
  /** Request settings per chat model, keyed by `modelRefKey`. */
  chatModelOptions: z.record(z.string().max(400), modelOptionsSchema),
  completion: completionSettingsSchema,
  /** The setup assistant was finished or skipped (it opens on first start otherwise). */
  setupDone: z.boolean(),
  /** Look for a new Hoverwing version on start (installed app only). */
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
  toolbar: [...defaultToolbar],
  workbench: defaultWorkbench,
  layoutProfiles: [],
  recentWorkspaces: [],
  sandboxBaseImage: DEFAULT_SANDBOX_BASE_IMAGE,
  chatModel: null,
  chatModelOptions: {},
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
