import { create } from 'zustand';
import type { PanelImperativeHandle } from 'react-resizable-panels';

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
