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
  shell,
  webContents,
} from 'electron';
import { spawn } from 'node:child_process';
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
import { BrowserManager, agentBrowser, createBrowserHandlers } from './modules/browser';
import { McpHost, browserTools, diagnosticsTools, writeBridge } from './modules/mcpHost';
import { McpConfigStore, McpService, connectMcp, createMcpHandlers } from './modules/mcp';
import {
  ProviderConfigStore,
  ProviderService,
  createProviderHandlers,
  openAiClient,
} from './modules/providers';
import { ChatService, ChatStore, createChatHandlers } from './modules/chat';
import { LayoutAssistant, createLayoutHandlers } from './modules/layoutAssistant';
import { CompletionService, createCompletionHandlers } from './modules/completion';
import * as systemInformation from 'systeminformation';
import electronUpdater from 'electron-updater';
import { UpdateService, createUpdateHandlers } from './modules/updates';
import {
  CatalogStore,
  DEFAULT_OLLAMA_URL,
  SetupService,
  createSetupHandlers,
  detectHardware,
  downloadVerified,
  isOllamaInstalled,
  ollamaApi,
  ollamaInstallPlan,
  pathExists,
} from './modules/setup';
import { childEnv } from './lib/env';
import { CONTAINER_MCP_BRIDGE, SandboxService, createSandboxHandlers } from './modules/sandbox';
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
import { TrustStore, createTrustHandlers } from './modules/trust';
import { LspConfigStore, LspService, createLspHandlers, spawnLspTransport } from './modules/lsp';
import { findProgram } from './lib/which';
import { GitService, createGitHandlers, runGitProcess } from './modules/git';
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
      if (!changes.overflow) void lsp.filesChanged(ownerId, changes.changes);
      git.touch(ownerId);
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
  const ruleStore = new RuleStore(permissionsDir);
  const permissions = new PermissionService(ruleStore, new AuditLog(permissionsDir), {
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
  });
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
      chat.release(contents.id);
      completion.release(contents.id);
      setup.release(contents.id);
      lsp.release(contents.id);
      git.release(contents.id);
    };
    contents.on('destroyed', release);
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) release();
    });
  });
  app.on('before-quit', () => {
    void workspaces.closeAll();
    terminals.killAll();
    lsp.releaseAll();
    git.releaseAll();
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
  /** A native question (main process), so a compromised renderer cannot answer it. */
  const askNatively = async (
    ownerId: number,
    question: { message: string; detail: string; confirm: string },
  ): Promise<boolean> => {
    const contents = webContents.fromId(ownerId);
    const window = contents ? BrowserWindow.fromWebContents(contents) : null;
    const text = nativeTexts[dialogLanguage(settings.get())];
    const options = {
      type: 'question' as const,
      message: question.message,
      detail: question.detail,
      buttons: [text.cancel, question.confirm],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    const result = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
    return result.response === 1;
  };
  const trust = new TrustStore(join(dataDir, 'trust.json'));
  trust.onChange((root, trusted) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (workspaces.get(window.webContents.id)?.root === root) {
        sendEvent(window.webContents, 'trust:changed', { trusted });
      }
    }
    void lsp.trustChanged(root, trusted);
    for (const window of BrowserWindow.getAllWindows()) {
      if (workspaces.get(window.webContents.id)?.root === root) {
        sendEvent(window.webContents, 'git:changed', {});
      }
    }
  });
  const git = new GitService({
    run: runGitProcess,
    isTrusted: (root) => trust.isTrusted(root),
    trash: (absolute) => shell.trashItem(absolute),
    env: () => childEnv(process.env),
    log: (line) => {
      broadcastEvent('git:log', { line, time: Date.now() });
    },
    onChanged: (ownerId) => {
      const contents = webContents.fromId(ownerId);
      if (contents) sendEvent(contents, 'git:changed', {});
    },
  });
  const lspConfigs = new LspConfigStore(join(dataDir, 'lsp'));
  const lsp = new LspService({
    configs: lspConfigs,
    isTrusted: (root) => trust.isTrusted(root),
    confirmStart: (ownerId, server) => {
      const text = nativeTexts[dialogLanguage(settings.get())];
      return askNatively(ownerId, {
        message: text.lspMessage.replace('{name}', server.name),
        detail: text.lspDetail.replace('{command}', [server.command, ...server.args].join(' ')),
        confirm: text.lspStart,
      });
    },
    programExists: async (command, cwd) =>
      (await findProgram(command, { platform: process.platform, env: process.env, cwd })) !== null,
    startTransport: spawnLspTransport,
    env: () => childEnv(process.env),
    events: {
      diagnostics: (ownerId, diagnostics) => {
        const contents = webContents.fromId(ownerId);
        if (contents) sendEvent(contents, 'lsp:diagnostics', diagnostics);
      },
      status: (ownerId, statuses) => {
        const contents = webContents.fromId(ownerId);
        if (contents) sendEvent(contents, 'lsp:status', statuses);
      },
      log: (line) => {
        broadcastEvent('lsp:log', { line, time: Date.now() });
      },
    },
  });
  const secrets = new SecretStore(join(dataDir, 'secrets.json'), safeStorage);
  const mcp = new McpService({
    configs: new McpConfigStore(join(dataDir, 'mcp')),
    secrets,
    rules: ruleStore,
    connect: connectMcp,
    confirmStart: (ownerId, config) => {
      const text = nativeTexts[dialogLanguage(settings.get())];
      const command =
        config.transport.type === 'stdio'
          ? [config.transport.command, ...config.transport.args].join(' ')
          : config.transport.url;
      return askNatively(ownerId, {
        message: text.mcpMessage.replace('{name}', config.name),
        detail: text.mcpDetail.replace('{command}', command),
        confirm: text.mcpAllow,
      });
    },
    baseEnv: () => childEnv(process.env),
    homeDir: homedir(),
    onChanged: () => {
      broadcastEvent('mcp:changed', {});
    },
    onLog: (line) => {
      broadcastEvent('mcp:log', { line, time: Date.now() });
    },
  });
  app.on('will-quit', () => {
    void mcp.closeAll();
  });
  const providers = new ProviderService({
    configs: new ProviderConfigStore(join(dataDir, 'providers.json')),
    secrets,
    createClient: openAiClient,
    onChanged: () => {
      broadcastEvent('providers:changed', {});
    },
  });
  const chat = new ChatService({
    providers,
    store: new ChatStore(join(dataDir, 'chats')),
    model: () => settings.get().chatModel,
    emit: (ownerId, chatId, event) => {
      const contents = webContents.fromId(ownerId);
      if (contents) sendEvent(contents, 'chat:event', { chatId, event });
    },
  });
  const layoutAssistant = new LayoutAssistant({
    providers,
    model: () => settings.get().chatModel,
    current: () => {
      const { workbench, toolbar, layout } = settings.get();
      return {
        workbench,
        toolbar,
        sidebarView: layout.sidebarView,
        bottomView: layout.bottomView,
      };
    },
    log: (line) => {
      console.warn('[layout]', line);
    },
  });
  const completion = new CompletionService({
    providers,
    settings: () => settings.get().completion,
  });
  const updates = new UpdateService({
    // Only the installed app updates itself (dev builds have no release feed).
    updater: app.isPackaged ? electronUpdater.autoUpdater : null,
    currentVersion: app.getVersion(),
    enabled: () => settings.get().checkForUpdates,
    onStatus: (status) => {
      broadcastEvent('updates:status', status);
    },
    log: (line) => {
      console.warn('[updates]', line);
    },
  });
  // One quiet check shortly after start; downloading needs a click.
  setTimeout(() => {
    void updates.check();
  }, 10_000);
  const githubJson = async (url: string): Promise<unknown> => {
    const response = await fetch(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'Kestrel' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    return response.json();
  };
  const setup = new SetupService({
    detectHardware: () =>
      detectHardware({
        si: systemInformation,
        platform: process.platform,
        arch: process.arch,
        env: process.env,
        homeDir: homedir(),
        exists: pathExists,
      }),
    catalog: new CatalogStore(dataDir, async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      return response.text();
    }),
    // E2E tests point this at a fake Ollama server.
    ollama: ollamaApi(process.env['KESTREL_OLLAMA_URL'] ?? DEFAULT_OLLAMA_URL),
    isOllamaInstalled: () => isOllamaInstalled(process.platform, process.env, pathExists),
    installPlan: () => ollamaInstallPlan(process.platform, githubJson),
    download: (plan, destination, onProgress, signal) =>
      downloadVerified(plan, destination, onProgress, signal),
    launchInstaller: async (ownerId, plan, file) => {
      const text = nativeTexts[dialogLanguage(settings.get())];
      const confirmed = await askNatively(ownerId, {
        message: text.installMessage,
        detail: text.installDetail
          .replace('{source}', plan.source)
          .replace('{file}', plan.fileName)
          .replace('{sha256}', plan.sha256),
        confirm: text.installStart,
      });
      if (!confirmed) return false;
      if (process.platform === 'win32') {
        spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
      } else {
        // macOS: the disk image opens in Finder; the user drags Ollama to Applications.
        await shell.openPath(file);
      }
      return true;
    },
    providers,
    settings,
    downloadsDir: join(dataDir, 'downloads'),
    progress: (ownerId, progress) => {
      const contents = webContents.fromId(ownerId);
      if (contents) sendEvent(contents, 'setup:progress', progress);
    },
  });
  const dockerApi = createDockerApi({ socketPath: await findDockerSocket() });
  // Kestrel's MCP server for agents (browser tools), plus the stdio bridge.
  const mcpBridge = await writeBridge(join(dataDir, 'mcp')).catch(() => null);
  const mcpHost = new McpHost(app.getVersion(), async () => {
    // Docker Desktop forwards host.docker.internal to the host's loopback;
    // on Linux, containers reach the host via the bridge gateway address.
    if (process.platform !== 'linux') return { listen: '127.0.0.1', url: 'host.docker.internal' };
    const gateway = await dockerApi.bridgeGateway();
    return gateway ? { listen: gateway, url: 'host.docker.internal' } : null;
  });
  app.on('will-quit', () => {
    void mcpHost.close();
  });
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
    mcpBridge: () => mcpBridge,
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
    secrets,
    sessions: new SessionHistory(join(dataDir, 'agent-sessions')),
    permissions,
    startTransport: spawnTransport,
    checkpoint: async (root, label, sessionId) =>
      (await checkpoints.create(root, label, 'turn', sessionId).catch(() => null))?.id ?? null,
    review,
    confirmStart: (ownerId, config) => {
      const text = nativeTexts[dialogLanguage(settings.get())];
      return askNatively(ownerId, {
        message: text.agentMessage.replace('{name}', config.name),
        detail: (config.sandbox.enabled ? text.agentSandboxDetail : text.agentDetail).replace(
          '{command}',
          [config.command, ...config.args].join(' '),
        ),
        confirm: text.agentStart,
      });
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
    mcp:
      (ownerId) =>
      async ({ sandboxed, http, check }) => {
        const access = agentBrowser(browser, ownerId, (state) => {
          const contents = webContents.fromId(ownerId);
          if (contents) sendEvent(contents, 'browser:opened', state);
        });
        const endpoint = await mcpHost.register(
          async () => [
            ...browserTools(access, check),
            ...diagnosticsTools(() => lsp.diagnostics(ownerId), check),
            ...(await mcp.agentTools(workspaces.get(ownerId)?.root ?? null, sandboxed, check)),
          ],
          sandboxed,
        );
        const url = sandboxed ? endpoint.containerUrl : endpoint.url;
        if (!url) throw new Error('Kestrel tools are not reachable from the sandbox.');
        const release = () => {
          mcpHost.revoke(endpoint.id);
        };
        if (http) {
          return {
            release,
            servers: [
              {
                type: 'http' as const,
                name: 'kestrel',
                url,
                headers: [{ name: 'Authorization', value: `Bearer ${endpoint.token}` }],
              },
            ],
          };
        }
        if (!mcpBridge) throw new Error('The MCP bridge script is missing.');
        const env = [
          { name: 'KESTREL_MCP_URL', value: url },
          { name: 'KESTREL_MCP_TOKEN', value: endpoint.token },
        ];
        return {
          release,
          servers: [
            sandboxed
              ? { name: 'kestrel', command: 'node', args: [CONTAINER_MCP_BRIDGE], env }
              : {
                  name: 'kestrel',
                  // Kestrel's own runtime runs the bridge as plain Node.
                  command: process.execPath,
                  args: [mcpBridge],
                  env: [...env, { name: 'ELECTRON_RUN_AS_NODE', value: '1' }],
                },
          ],
        };
      },
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
        lsp.release(ownerId);
        git.release(ownerId);
      }),
      ...createTerminalHandlers(terminals, workspaces),
      ...createPermissionHandlers(permissions, workspaces),
      ...createCheckpointHandlers(checkpoints, workspaces),
      ...createAgentHandlers(agents, workspaces),
      ...createReviewHandlers(review, workspaces),
      ...createDockerHandlers(dockerPanel, workspaces),
      ...createBrowserHandlers(browser),
      ...createMcpHandlers(mcp, workspaces),
      ...createProviderHandlers(providers),
      ...createChatHandlers(chat),
      ...createLayoutHandlers(layoutAssistant),
      ...createCompletionHandlers(completion),
      ...createSetupHandlers(setup),
      ...createUpdateHandlers(updates),
      ...createSandboxHandlers(
        sandbox,
        terminals,
        async (agentId) => (await agentConfigs.get(agentId)) !== undefined,
      ),
      ...createSearchHandlers(search, workspaces),
      ...createGitHandlers(git, workspaces),
      ...createLspHandlers(lsp, lspConfigs, workspaces, () => {
        broadcastEvent('lsp:changed', {});
      }),
      ...createTrustHandlers(trust, workspaces, (ownerId, root) => {
        const text = nativeTexts[dialogLanguage(settings.get())];
        return askNatively(ownerId, {
          message: text.trustMessage,
          detail: text.trustDetail.replace('{root}', root),
          confirm: text.trustAllow,
        });
      }),
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
