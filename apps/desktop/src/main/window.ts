import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import { lockNavigation } from './security';
import { hardenedWebPreferences } from './webPreferences';

export interface MainWindowOptions {
  /** URL of the renderer: dev server URL or file:// URL of the built page. */
  appUrl: string;
}

export function createMainWindow({ appUrl }: MainWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: 'Kestrel',
    backgroundColor: '#0F1115',
    webPreferences: hardenedWebPreferences(join(import.meta.dirname, '../preload/index.cjs')),
  });

  lockNavigation(window.webContents, appUrl);
  window.once('ready-to-show', () => {
    window.show();
  });
  void window.loadURL(appUrl);
  return window;
}
