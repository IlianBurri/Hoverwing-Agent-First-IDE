import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import {
  BrowserWindow,
  app,
  dialog,
  nativeTheme,
  safeStorage,
  session,
  webContents,
} from 'electron';
import type { Settings } from '@kestrel/shared';
import { createAppHandlers } from './modules/app/handlers';
import {
  AgentConfigStore,
  AgentService,
  SessionHistory,
  createAgentHandlers,
  spawnTransport,
} from './modules/agent';
import { SecretStore } from './modules/secrets';
import { nativeTexts } from './nativeTexts';
import {
  AuditLog,
  PermissionService,
  RuleStore,
  createPermissionHandlers,
} from './modules/permissions';
import { CheckpointService, createCheckpointHandlers } from './modules/checkpoints';
import { SearchRunner, createSearchHandlers } from './modules/search';
import { createSettingsHandlers, createSettingsStore } from './modules/settings';
import { TerminalManager, createTerminalHandlers, spawnNodePty } from './modules/terminal';
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
  const checkpoints = new CheckpointService(
    join(app.getPath('userData'), 'checkpoints'),
    (root) => {
      // Tell every window that shows this project.
      for (const window of BrowserWindow.getAllWindows()) {
        if (workspaces.get(window.webContents.id)?.root === root) {
          sendEvent(window.webContents, 'checkpoints:changed', {});
        }
      }
    },
  );
  const permissionsDir = join(app.getPath('userData'), 'permissions');
  const permissions = new PermissionService(
    new RuleStore(permissionsDir),
    new AuditLog(permissionsDir),
    {
      request: (ownerId, request) => {
        const contents = webContents.fromId(ownerId);
        if (contents) sendEvent(contents, 'permissions:request', request);
      },
      resolved: (ownerId, id) => {
        const contents = webContents.fromId(ownerId);
        if (contents) sendEvent(contents, 'permissions:resolved', { id });
      },
      logged: (ownerId, entry) => {
        const contents = webContents.fromId(ownerId);
        if (contents) sendEvent(contents, 'permissions:logged', entry);
      },
    },
  );
  const sendTo = (ownerId: number) => webContents.fromId(ownerId);
  const terminals = new TerminalManager(spawnNodePty, {
    onData: (ownerId, id, data) => {
      const contents = sendTo(ownerId);
      if (contents) sendEvent(contents, 'terminal:data', { id, data });
    },
    onExit: (ownerId, id, exitCode) => {
      const contents = sendTo(ownerId);
      if (contents) sendEvent(contents, 'terminal:exit', { id, exitCode });
    },
  });
  app.on('web-contents-created', (_event, contents) => {
    // A closed or reloaded window releases its workspace, watcher and search.
    const release = () => {
      void workspaces.close(contents.id);
      search.cancel(contents.id);
      terminals.killAll(contents.id);
      permissions.cancel(contents.id);
      void agents.release(contents.id);
    };
    contents.on('destroyed', release);
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) release();
    });
  });
  app.on('before-quit', () => {
    void workspaces.closeAll();
    terminals.killAll();
  });

  const dataDir = app.getPath('userData');
  const agents = new AgentService({
    configs: new AgentConfigStore(dataDir),
    secrets: new SecretStore(join(dataDir, 'secrets.json'), safeStorage),
    sessions: new SessionHistory(join(dataDir, 'agent-sessions')),
    permissions,
    startTransport: spawnTransport,
    checkpoint: async (root, label, sessionId) =>
      (await checkpoints.create(root, label, 'turn', sessionId).catch(() => null))?.id ?? null,
    confirmStart: async (ownerId, config) => {
      const contents = webContents.fromId(ownerId);
      const window = contents ? BrowserWindow.fromWebContents(contents) : null;
      const text = nativeTexts[dialogLanguage(settings.get())];
      const options = {
        type: 'question' as const,
        message: text.agentMessage.replace('{name}', config.name),
        detail: text.agentDetail.replace('{command}', [config.command, ...config.args].join(' ')),
        buttons: [text.cancel, text.agentStart],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      };
      const result = window
        ? await dialog.showMessageBox(window, options)
        : await dialog.showMessageBox(options);
      return result.response === 1;
    },
    events: {
      status: (ownerId, status) => {
        const contents = webContents.fromId(ownerId);
        if (contents) sendEvent(contents, 'agent:status', status);
      },
      event: (ownerId, sessionId, event) => {
        const contents = webContents.fromId(ownerId);
        if (contents) sendEvent(contents, 'agent:event', { sessionId, event });
      },
      log: (ownerId, line) => {
        const contents = webContents.fromId(ownerId);
        if (contents) sendEvent(contents, 'agent:log', { line, time: Date.now() });
      },
    },
    clientVersion: app.getVersion(),
  });
  app.on('before-quit', () => {
    for (const window of BrowserWindow.getAllWindows()) void agents.release(window.webContents.id);
  });

  registerIpc(
    {
      ...createAppHandlers(),
      ...createSettingsHandlers(settings),
      ...createWorkspaceHandlers(workspaces, settings, (ownerId) => {
        terminals.killAll(ownerId);
        void agents.stop(ownerId);
      }),
      ...createTerminalHandlers(terminals, workspaces),
      ...createPermissionHandlers(permissions, workspaces),
      ...createCheckpointHandlers(checkpoints, workspaces),
      ...createAgentHandlers(agents, workspaces),
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
