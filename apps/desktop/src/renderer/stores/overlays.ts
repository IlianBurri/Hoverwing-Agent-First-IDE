import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Number of open overlays (dialogs, menus, palette). The browser page is a
 * native view on top of the HTML, so it hides itself while any is open.
 */
export const useOverlayStore = create<{ count: number }>()(() => ({ count: 0 }));

/** Registers an overlay while `active` (and mounted). */
export function useOverlay(active = true): void {
  useEffect(() => {
    if (!active) return;
    useOverlayStore.setState((state) => ({ count: state.count + 1 }));
    return () => {
      useOverlayStore.setState((state) => ({ count: Math.max(0, state.count - 1) }));
    };
  }, [active]);
}
