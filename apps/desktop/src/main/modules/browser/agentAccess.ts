import type { BrowserState } from '@kestrel/shared';
import type { ConsoleEntry, NetworkError } from './collector';
import type { BrowserManager } from './manager';

const SCREENSHOT_WIDTH = 1280;
const OPEN_TIMEOUT_MS = 15_000;

export interface AgentBrowserTab {
  tabId: string;
  url: string;
  title: string;
}

/**
 * What agent tools may do with the browser tabs of one window. Permission
 * checks happen in the tools, before any of this is called.
 */
export function agentBrowser(
  manager: BrowserManager,
  ownerId: number,
  /** Shows a tab the agent opened in the editor area. */
  onOpened: (state: BrowserState) => void,
) {
  const info = (tabId?: string): AgentBrowserTab => {
    const state = manager.stateOf(manager.agentTab(ownerId, tabId));
    return { tabId: state.tabId, url: state.url, title: state.title };
  };
  return {
    tabs: (): AgentBrowserTab[] =>
      manager.tabsOf(ownerId).map((tab) => {
        const state = manager.stateOf(tab);
        return { tabId: state.tabId, url: state.url, title: state.title };
      }),
    screenshot: async (tabId?: string) => {
      const tab = manager.agentTab(ownerId, tabId);
      const png = await manager.screenshot(tab, SCREENSHOT_WIDTH);
      if (png.length === 0) {
        throw new Error('The tab is not visible. Ask the user to show it in Kestrel, then retry.');
      }
      return { tab: info(tab.id), png };
    },
    console: (tabId?: string): { tab: AgentBrowserTab; entries: ConsoleEntry[] } => {
      const tab = manager.agentTab(ownerId, tabId);
      return { tab: info(tab.id), entries: [...tab.collector.console] };
    },
    networkErrors: (tabId?: string): { tab: AgentBrowserTab; entries: NetworkError[] } => {
      const tab = manager.agentTab(ownerId, tabId);
      return { tab: info(tab.id), entries: [...tab.collector.network] };
    },
    open: async (url: string): Promise<AgentBrowserTab> => {
      const state = manager.create(ownerId, url);
      onOpened(state);
      const started = Date.now();
      // Give the page a moment to load, so the agent can look at it right away.
      while (Date.now() - started < OPEN_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const current = manager.stateOf(manager.agentTab(ownerId, state.tabId));
        if (!current.loading && current.url) break;
      }
      return info(state.tabId);
    },
  };
}
