import { create } from 'zustand';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import type { Workbench } from '@kestrel/shared';
import { useSettingsStore } from './settings';

export type CollapsiblePanel = 'sidebar' | 'bottom' | 'agent';

interface LayoutState {
  collapsed: Record<CollapsiblePanel, boolean>;
  setCollapsed: (panel: CollapsiblePanel, collapsed: boolean) => void;
}

export const useLayoutStore = create<LayoutState>()((set) => ({
  collapsed: { sidebar: false, bottom: false, agent: false },
  setCollapsed: (panel, collapsed) => {
    set((state) =>
      state.collapsed[panel] === collapsed
        ? state
        : { collapsed: { ...state.collapsed, [panel]: collapsed } },
    );
  },
}));

/** Imperative panel handles; not React state because they never re-render. */
const panelHandles = new Map<CollapsiblePanel, PanelImperativeHandle>();

export function registerPanel(panel: CollapsiblePanel, handle: PanelImperativeHandle | null): void {
  if (handle) panelHandles.set(panel, handle);
  else panelHandles.delete(panel);
}

export function setPanelOpen(panel: CollapsiblePanel, open: boolean): void {
  const handle = panelHandles.get(panel);
  if (!handle) return;
  if (open) handle.expand();
  else handle.collapse();
}

export function togglePanel(panel: CollapsiblePanel): void {
  setPanelOpen(panel, useLayoutStore.getState().collapsed[panel]);
}

/** Until the stored open state is applied on start, collapse events are not saved. */
let panelStateReady = false;
let persistTimer: number | undefined;
const PERSIST_DELAY_MS = 300;

/** Opens/collapses the panels as given (on start, or when a profile is applied). */
export function applyPanelState(
  panels: Workbench['panels'],
  { initial = false }: { initial?: boolean } = {},
): void {
  for (const panel of ['sidebar', 'bottom', 'agent'] as const) setPanelOpen(panel, panels[panel]);
  if (initial) {
    // The panels report their sizes asynchronously; save only what follows.
    window.requestAnimationFrame(() => {
      panelStateReady = true;
    });
  }
}

/** Saves which panels are open (debounced), so the next start looks the same. */
export function persistPanelState(): void {
  if (!panelStateReady) return;
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    const { collapsed } = useLayoutStore.getState();
    const { settings, update } = useSettingsStore.getState();
    const panels = {
      sidebar: !collapsed.sidebar,
      bottom: !collapsed.bottom,
      agent: !collapsed.agent,
    };
    const stored = settings.workbench.panels;
    if (
      stored.sidebar === panels.sidebar &&
      stored.bottom === panels.bottom &&
      stored.agent === panels.agent
    ) {
      return;
    }
    void update({ workbench: { ...settings.workbench, panels } });
  }, PERSIST_DELAY_MS);
}

/**
 * Returns a stored layout only if it fits the panels that exist now;
 * otherwise the group falls back to its default sizes.
 */
export function usableLayout(
  stored: Record<string, number> | undefined,
  panelIds: readonly string[],
): Record<string, number> | undefined {
  if (!stored) return undefined;
  const keys = Object.keys(stored);
  if (keys.length !== panelIds.length || !panelIds.every((id) => keys.includes(id))) {
    return undefined;
  }
  const total = Object.values(stored).reduce((sum, size) => sum + size, 0);
  return Math.abs(total - 100) < 1 ? stored : undefined;
}
