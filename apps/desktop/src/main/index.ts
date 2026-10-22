import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { BrowserWindow, app, nativeTheme, session } from 'electron';
import type { Settings } from '@kestrel/shared';
import { toAppInfo } from './modules/app';
import { createSettingsStore } from './modules/settings';
import { broadcastEvent } from './ipc/events';
import { registerIpc } from './ipc/register';
import {
  CONTENT_SECURITY_POLICY,
  applySessionSecurity,
  devContentSecurityPolicy,
  isAppUrl,
} from './security';
import { titleBarOverlay } from './titleBar';
import type { TitleBarTheme } from './titleBar';
import { createMainWindow } from './window';

const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
const appUrl =
  !app.isPackaged && devServerUrl
    ? devServerUrl
    : pathToFileURL(join(import.meta.dirname, '../renderer/index.html')).href;

// Force the OS sandbox for every renderer. Skipped only when --no-sandbox is
// passed explicitly (e.g. CI containers running as root), because Chromium
// cannot combine both.
if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();

// E2E tests point this at a temp dir so they never touch real user data.
const userDataOverride = process.env['KESTREL_USER_DATA_DIR'];
if (userDataOverride) app.setPath('userData', userDataOverride);

function initialTheme(settings: Settings): TitleBarTheme {
  if (settings.theme === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return settings.theme;
}

void app.whenReady().then(async () => {
  applySessionSecurity(
    session.defaultSession,
    devServerUrl && !app.isPackaged
      ? devContentSecurityPolicy(devServerUrl)
      : CONTENT_SECURITY_POLICY,
  );

  const settings = await createSettingsStore(join(app.getPath('userData'), 'settings.json'));
  settings.onChange((next) => {
    broadcastEvent('settings:changed', next);
  });

  registerIpc(
    {
      'app:getInfo': () =>
        toAppInfo({
          name: app.getName(),
          version: app.getVersion(),
          platform: process.platform,
          locale: app.getLocale(),
        }),
      'settings:get': () => settings.get(),
      'settings:update': (patch) => settings.update(patch),
      'window:setTitleBarTheme': (theme, { sender }) => {
        const window = BrowserWindow.fromWebContents(sender);
        if (window && process.platform !== 'darwin') {
          window.setTitleBarOverlay(titleBarOverlay(theme));
        }
        return null;
      },
    },
    (url) => isAppUrl(url, appUrl),
  );

  createMainWindow({ appUrl, theme: initialTheme(settings.get()) });

  app.on('activate', () => {
    // macOS: recreate a window when the dock icon is clicked.
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow({ appUrl, theme: initialTheme(settings.get()) });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
