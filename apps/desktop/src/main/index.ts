import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { BrowserWindow, app, session } from 'electron';
import { toAppInfo } from './modules/app';
import { registerIpc } from './ipc/register';
import {
  CONTENT_SECURITY_POLICY,
  applySessionSecurity,
  devContentSecurityPolicy,
  isAppUrl,
} from './security';
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

void app.whenReady().then(() => {
  applySessionSecurity(
    session.defaultSession,
    devServerUrl && !app.isPackaged
      ? devContentSecurityPolicy(devServerUrl)
      : CONTENT_SECURITY_POLICY,
  );

  registerIpc(
    {
      'app:getInfo': () =>
        toAppInfo({
          name: app.getName(),
          version: app.getVersion(),
          platform: process.platform,
          locale: app.getLocale(),
        }),
    },
    (url) => isAppUrl(url, appUrl),
  );

  createMainWindow({ appUrl });

  app.on('activate', () => {
    // macOS: recreate a window when the dock icon is clicked.
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow({ appUrl });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
