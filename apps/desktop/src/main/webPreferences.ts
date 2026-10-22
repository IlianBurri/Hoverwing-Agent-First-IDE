import type { WebPreferences } from 'electron';

/**
 * Hardened settings for every window that shows app UI.
 * Changing any of these is a security decision: see CLAUDE.md.
 */
export function hardenedWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    spellcheck: false,
  };
}
