import { WebContentsView, session } from 'electron';
import type { BrowserWindow, Session, WebContents } from 'electron';
import type { BrowserBounds, BrowserState } from '@kestrel/shared';
import { isAllowedBrowserUrl, normalizeBrowserUrl } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { PageCollector } from './collector';

/** Persistent, so logins in your dev apps survive a restart. */
export const BROWSER_PARTITION = 'persist:kestrel-browser';
const ABORTED = -3;
const RECORDING_WAIT_MS = 1000;

interface Tab {
  id: string;
  ownerId: number;
  view: WebContentsView;
  collector: PageCollector;
  error: string | null;
  /** Resolves once console/network recording runs (pages load after that). */
  ready: Promise<void>;
}

export interface BrowserEvents {
  state(ownerId: number, state: BrowserState): void;
  openTab(ownerId: number, url: string): void;
}

let sessionPrepared = false;

/** The browser session: no permissions for pages, nothing shared with the app. */
function browserSession(): Session {
  const browser = session.fromPartition(BROWSER_PARTITION);
  if (!sessionPrepared) {
    sessionPrepared = true;
    browser.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
    browser.setPermissionCheckHandler(() => false);
    // Without a save path Electron asks where to save each download.
  }
  return browser;
}

/** Browser tabs of all windows; each tab is a WebContentsView inside its window. */
export class BrowserManager {
  private readonly tabs = new Map<string, Tab>();
  private nextId = 1;

  constructor(
    private readonly window: (ownerId: number) => BrowserWindow | null,
    private readonly events: BrowserEvents,
  ) {}

  /** Web contents of browser pages (not app windows). */
  isBrowserContents(contentsId: number): boolean {
    for (const tab of this.tabs.values()) {
      if (!tab.view.webContents.isDestroyed() && tab.view.webContents.id === contentsId) {
        return true;
      }
    }
    return false;
  }

  private tab(ownerId: number, tabId: string): Tab {
    const tab = this.tabs.get(tabId);
    if (tab?.ownerId !== ownerId) throw new UserError('not_found', 'Browser tab not found.');
    return tab;
  }

  /** Tabs of a window, oldest first. */
  tabsOf(ownerId: number): Tab[] {
    return [...this.tabs.values()].filter((tab) => tab.ownerId === ownerId);
  }

  stateOf(tab: Tab): BrowserState {
    const contents = tab.view.webContents;
    return {
      tabId: tab.id,
      url: contents.getURL(),
      title: contents.getTitle(),
      loading: contents.isLoading(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      error: tab.error,
    };
  }

  private emit(tab: Tab): void {
    if (!tab.view.webContents.isDestroyed()) this.events.state(tab.ownerId, this.stateOf(tab));
  }

  create(ownerId: number, url?: string): BrowserState {
    const window = this.window(ownerId);
    if (!window) throw new UserError('not_found', 'Window not found.');
    const target = url === undefined ? null : normalizeBrowserUrl(url);
    if (url !== undefined && target === null) {
      throw new UserError('invalid_url', 'Only http and https addresses can be opened.');
    }
    const view = new WebContentsView({
      webPreferences: {
        session: browserSession(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    });
    view.setVisible(false);
    window.contentView.addChildView(view);
    const tab: Tab = {
      id: `b${String(this.nextId++)}`,
      ownerId,
      view,
      collector: new PageCollector(),
      error: null,
      ready: Promise.resolve(),
    };
    this.tabs.set(tab.id, tab);
    tab.ready = this.wire(tab, view.webContents);
    // An empty tab still loads about:blank, so its renderer exists and the
    // recording (CDP) is ready before the first real page.
    this.load(tab, target ?? 'about:blank');
    return this.stateOf(tab);
  }

  /** Loads a page once recording is on, so its first requests are not missed. */
  private load(tab: Tab, url: string): void {
    // about:blank creates the renderer the recording waits for: load it now.
    const ready = url === 'about:blank' ? Promise.resolve() : tab.ready;
    void ready.then(() => tab.view.webContents.loadURL(url)).catch(() => undefined);
  }

  private wire(tab: Tab, contents: WebContents): Promise<void> {
    // Pages may only go to web addresses (no file:, no app internals).
    const guard = (event: { preventDefault(): void; url: string }) => {
      if (!isAllowedBrowserUrl(event.url)) event.preventDefault();
    };
    contents.on('will-navigate', guard);
    contents.on('will-redirect', guard);
    contents.on('will-frame-navigate', guard);
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedBrowserUrl(url) && url !== 'about:blank') this.events.openTab(tab.ownerId, url);
      return { action: 'deny' };
    });
    // Pages must not attach their own webviews.
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    const update = () => {
      this.emit(tab);
    };
    contents.on('did-start-loading', () => {
      tab.error = null;
      update();
    });
    contents.on('did-stop-loading', update);
    // A new page starts with empty logs. Cleared when the navigation starts,
    // before any request of the new page (did-navigate may arrive later).
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) tab.collector.clear();
    });
    contents.on('did-navigate', () => {
      // The initial about:blank is not a page to go back to.
      const history = contents.navigationHistory;
      if (history.length() > 1 && history.getEntryAtIndex(0).url === 'about:blank') {
        history.removeEntryAtIndex(0);
      }
      update();
    });
    contents.on('did-navigate-in-page', update);
    contents.on('page-title-updated', update);
    contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (!isMainFrame || code === ABORTED) return;
      tab.error = description || String(code);
      update();
    });

    // Console and network errors for the agent tools (Chrome DevTools Protocol).
    try {
      contents.debugger.attach('1.3');
      contents.debugger.on('message', (_event, method, params) => {
        tab.collector.handle(method, params as Record<string, unknown>);
      });
      const enabled = Promise.all(
        ['Runtime.enable', 'Log.enable', 'Network.enable'].map((domain) =>
          contents.debugger.sendCommand(domain).catch(() => undefined),
        ),
      ).then(() => undefined);
      // A tab that never loaded may not answer until it does: wait at most briefly.
      return Promise.race([
        enabled,
        new Promise<void>((resolve) => setTimeout(resolve, RECORDING_WAIT_MS)),
      ]);
    } catch {
      // Another debugger is attached; the page still works, only logs are missing.
      return Promise.resolve();
    }
  }

  navigate(ownerId: number, tabId: string, input: string): void {
    const tab = this.tab(ownerId, tabId);
    const url = normalizeBrowserUrl(input);
    if (!url) throw new UserError('invalid_url', 'Only http and https addresses can be opened.');
    tab.error = null;
    this.load(tab, url);
  }

  back(ownerId: number, tabId: string): void {
    const history = this.tab(ownerId, tabId).view.webContents.navigationHistory;
    if (history.canGoBack()) history.goBack();
  }

  forward(ownerId: number, tabId: string): void {
    const history = this.tab(ownerId, tabId).view.webContents.navigationHistory;
    if (history.canGoForward()) history.goForward();
  }

  reload(ownerId: number, tabId: string): void {
    this.tab(ownerId, tabId).view.webContents.reload();
  }

  stop(ownerId: number, tabId: string): void {
    this.tab(ownerId, tabId).view.webContents.stop();
  }

  setBounds(ownerId: number, tabId: string, bounds: BrowserBounds): void {
    const { view } = this.tab(ownerId, tabId);
    if (!bounds || bounds.width < 1 || bounds.height < 1) {
      view.setVisible(false);
      return;
    }
    view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
    view.setVisible(true);
  }

  openDevTools(ownerId: number, tabId: string): void {
    this.tab(ownerId, tabId).view.webContents.openDevTools({ mode: 'detach' });
  }

  close(ownerId: number, tabId: string): void {
    const tab = this.tab(ownerId, tabId);
    this.destroy(tab);
  }

  private destroy(tab: Tab): void {
    this.tabs.delete(tab.id);
    const window = this.window(tab.ownerId);
    if (window && !window.isDestroyed()) window.contentView.removeChildView(tab.view);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
  }

  /** The window closed or reloaded: close its browser tabs. */
  release(ownerId: number): void {
    for (const tab of this.tabsOf(ownerId)) this.destroy(tab);
  }

  async clearData(): Promise<void> {
    const browser = browserSession();
    await browser.clearStorageData();
    await browser.clearCache();
  }

  /** For the agent tools: a tab of this window (the given one, or the newest). */
  agentTab(ownerId: number, tabId?: string): Tab {
    if (tabId) return this.tab(ownerId, tabId);
    const tab = this.tabsOf(ownerId).at(-1);
    if (!tab) throw new UserError('not_found', 'No browser tab is open.');
    return tab;
  }

  /** PNG of the visible page, at most `maxWidth` pixels wide. */
  async screenshot(tab: Tab, maxWidth: number): Promise<Buffer> {
    const image = await tab.view.webContents.capturePage();
    const size = image.getSize();
    const scaled = size.width > maxWidth ? image.resize({ width: maxWidth }) : image;
    return scaled.toPNG();
  }
}
