import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { BrowserWindow, app, nativeTheme, session, webContents } from 'electron';
import type { Settings } from '@kestrel/shared';
import { toAppInfo } from './modules/app';
import { SearchRunner, createSearchHandlers } from './modules/search';
import { createSettingsHandlers, createSettingsStore } from './modules/settings';
import { WorkspaceManager, createWorkspaceHandlers, watchWorkspace } from './modules/workspace';
import { broadcastEvent, sendEvent } from './ipc/events';
import { registerIpc } from './ipc/register';
import {
  CONTENT_SECURITY_POLICY,
  applySessionSecurity,
  devContentSecurityPolicy,
  isAppUrl,
} from './security';
import { titleBarOverlay } from './titleBar';
import type { TitleBarTheme } from './titleBar';
import { installAppMenu } from './menu';
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

function dialogLanguage(settings: Settings): 'de' | 'en' {
  return settings.language ?? (app.getLocale().startsWith('de') ? 'de' : 'en');
}

function initialTheme(settings: Settings): TitleBarTheme {
  if (settings.theme === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return settings.theme;
}

void app.whenReady().then(async () => {
  installAppMenu();
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

  const workspaces = new WorkspaceManager({
    watch: watchWorkspace,
    onChanges: (ownerId, changes) => {
      const contents = webContents.fromId(ownerId);
      if (contents) sendEvent(contents, 'workspace:changed', changes);
    },
  });
  const search = new SearchRunner();
  app.on('web-contents-created', (_event, contents) => {
    // A closed or reloaded window releases its workspace, watcher and search.
    contents.on('destroyed', () => {
      void workspaces.close(contents.id);
      search.cancel(contents.id);
    });
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) void workspaces.close(contents.id);
    });
  });
  app.on('before-quit', () => void workspaces.closeAll());

  registerIpc(
    {
      'app:getInfo': () =>
        toAppInfo({
          name: app.getName(),
          version: app.getVersion(),
          platform: process.platform,
          locale: app.getLocale(),
        }),
      ...createSettingsHandlers(settings),
      ...createWorkspaceHandlers(workspaces, settings),
      ...createSearchHandlers(search, workspaces),
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

  createMainWindow({
    appUrl,
    theme: initialTheme(settings.get()),
    language: () => dialogLanguage(settings.get()),
  });

  app.on('activate', () => {
    // macOS: recreate a window when the dock icon is clicked.
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow({
        appUrl,
        theme: initialTheme(settings.get()),
        language: () => dialogLanguage(settings.get()),
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
