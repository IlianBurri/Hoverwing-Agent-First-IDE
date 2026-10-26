import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
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
import { BrowserManager, createBrowserHandlers } from './modules/browser';
import { SandboxService, createSandboxHandlers } from './modules/sandbox';
import {
  DEFAULT_SANDBOX_PACKAGES,
  DockerPanelService,
  createDockerHandlers,
  classifyDockerError,
  createDockerApi,
  dockerInstallPaths,
  dockerSocketCandidates,
  isValidPackageName,
} from './modules/docker';
import { nativeTexts } from './nativeTexts';
import {
  AuditLog,
  PermissionService,
  RuleStore,
  createPermissionHandlers,
} from './modules/permissions';
import { CheckpointService, createCheckpointHandlers } from './modules/checkpoints';
import { ReviewService, createReviewHandlers } from './modules/review';
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

async function anyExists(paths: readonly string[]): Promise<boolean> {
  for (const path of paths) {
    try {
      await access(path);
      return true;
    } catch {
      // try the next one
    }
  }
  return false;
}

/** The first Docker socket that exists (undefined: library default). */
async function findDockerSocket(): Promise<string | undefined> {
  const candidates = dockerSocketCandidates(process.platform, homedir(), process.env);
  if (!candidates) return undefined;
  for (const candidate of candidates) if (await anyExists([candidate])) return candidate;
  return candidates[0];
}

/**
 * Packages of the sandbox image. KESTREL_SANDBOX_PACKAGES replaces the list
 * (e.g. "" for networks where apt cannot reach Debian, or in E2E tests).
 */
function sandboxPackages(): readonly string[] {
  const override = process.env['KESTREL_SANDBOX_PACKAGES'];
  if (override === undefined) return DEFAULT_SANDBOX_PACKAGES;
  return override.split(/\s+/).filter((name) => name && isValidPackageName(name));
}

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
  const browser = new BrowserManager(
    (ownerId) => {
      const contents = webContents.fromId(ownerId);
      return contents ? BrowserWindow.fromWebContents(contents) : null;
    },
    {
      state: (ownerId, state) => {
        const contents = webContents.fromId(ownerId);
        if (contents) sendEvent(contents, 'browser:state', state);
      },
      openTab: (ownerId, url) => {
        const contents = webContents.fromId(ownerId);
        if (contents) sendEvent(contents, 'browser:openTab', { url });
      },
    },
  );
  app.on('web-contents-created', (_event, contents) => {
    // A closed or reloaded window releases its workspace, watcher and search.
    const release = () => {
      // Browser pages are web contents too, but own no window state.
      if (browser.isBrowserContents(contents.id)) return;
      browser.release(contents.id);
      void workspaces.close(contents.id);
      search.cancel(contents.id);
      terminals.killAll(contents.id);
      permissions.cancel(contents.id);
      void agents.release(contents.id);
      dockerPanel.release(contents.id);
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
  const review = new ReviewService(
    {
      changesSince: (root, id) => checkpoints.repo(root).changesSince(id),
      fileAt: (root, id, path) => checkpoints.repo(root).fileAt(id, path),
    },
    (root) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (workspaces.get(window.webContents.id)?.root === root) {
          sendEvent(window.webContents, 'review:changed', {});
        }
      }
    },
  );
  const dockerApi = createDockerApi({ socketPath: await findDockerSocket() });
  const sandbox = new SandboxService({
    docker: dockerApi,
    dataDir: join(dataDir, 'sandbox'),
    platform: process.platform,
    identity: {
      uid: process.getuid?.() ?? null,
      gid: process.getgid?.() ?? null,
    },
    hostEnv: process.env,
    isInstalled: () => anyExists(dockerInstallPaths(process.platform, process.env)),
    classifyError: classifyDockerError,
    baseImage: () => settings.get().sandboxBaseImage,
    packages: sandboxPackages(),
    instance: createHash('sha256').update(dataDir).digest('hex').slice(0, 16),
    onLog: (line) => {
      broadcastEvent('sandbox:log', { line, time: Date.now() });
    },
    onStatus: (status) => {
      broadcastEvent('sandbox:status', status);
    },
  });
  void sandbox.removeOrphans().catch(() => undefined);
  const dockerPanel = new DockerPanelService({
    docker: dockerApi,
    state: () => sandbox.dockerState(),
    onChanged: () => {
      broadcastEvent('docker:changed', {});
    },
    onOutput: (ownerId, streamId, data) => {
      const contents = webContents.fromId(ownerId);
      if (contents) sendEvent(contents, 'docker:output', { streamId, data });
    },
    onStreamEnded: (ownerId, streamId, ok) => {
      const contents = webContents.fromId(ownerId);
      if (contents) sendEvent(contents, 'docker:streamEnded', { streamId, ok });
    },
    onLog: (line) => {
      broadcastEvent('sandbox:log', { line, time: Date.now() });
    },
  });
  const agentConfigs = new AgentConfigStore(dataDir, () => sandbox.isAvailable());
  const agents = new AgentService({
    configs: agentConfigs,
    sandbox,
    secrets: new SecretStore(join(dataDir, 'secrets.json'), safeStorage),
    sessions: new SessionHistory(join(dataDir, 'agent-sessions')),
    permissions,
    startTransport: spawnTransport,
    checkpoint: async (root, label, sessionId) =>
      (await checkpoints.create(root, label, 'turn', sessionId).catch(() => null))?.id ?? null,
    review,
    confirmStart: async (ownerId, config) => {
      const contents = webContents.fromId(ownerId);
      const window = contents ? BrowserWindow.fromWebContents(contents) : null;
      const text = nativeTexts[dialogLanguage(settings.get())];
      const options = {
        type: 'question' as const,
        message: text.agentMessage.replace('{name}', config.name),
        detail: (config.sandbox.enabled ? text.agentSandboxDetail : text.agentDetail).replace(
          '{command}',
          [config.command, ...config.args].join(' '),
        ),
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
      ...createReviewHandlers(review, workspaces),
      ...createDockerHandlers(dockerPanel, workspaces),
      ...createBrowserHandlers(browser),
      ...createSandboxHandlers(
        sandbox,
        terminals,
        async (agentId) => (await agentConfigs.get(agentId)) !== undefined,
      ),
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
