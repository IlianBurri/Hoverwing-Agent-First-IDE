import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import { lockNavigation } from './security';
import { titleBarOptions } from './titleBar';
import type { TitleBarTheme } from './titleBar';
import { guardUnsavedChanges } from './unsavedChanges';
import { hardenedWebPreferences } from './webPreferences';

export interface MainWindowOptions {
  /** URL of the renderer: dev server URL or file:// URL of the built page. */
  appUrl: string;
  /** Initial theme for the window background and native controls. */
  theme: TitleBarTheme;
  /** Language for native dialogs shown by the main process. */
  language: () => 'de' | 'en';
}

const backgrounds: Record<TitleBarTheme, string> = { dark: '#0f1115', light: '#ffffff' };

export function createMainWindow({ appUrl, theme, language }: MainWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: 'Kestrel',
    backgroundColor: backgrounds[theme],
    ...titleBarOptions(process.platform, theme),
    webPreferences: hardenedWebPreferences(join(import.meta.dirname, '../preload/index.cjs')),
  });

  lockNavigation(window.webContents, appUrl);
  guardUnsavedChanges(window, language);
  window.once('ready-to-show', () => {
    window.show();
  });
  void window.loadURL(appUrl);
  return window;
}
