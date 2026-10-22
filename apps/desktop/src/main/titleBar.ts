import type { BrowserWindowConstructorOptions, TitleBarOverlayOptions } from 'electron';

export type TitleBarTheme = 'dark' | 'light';

/** Height of the custom title bar in the renderer (see TitleBar.module.css). */
export const TITLE_BAR_HEIGHT = 36;

/** Mirrors --surface and --text from the renderer's themes.css. */
const overlayColors: Record<TitleBarTheme, { color: string; symbolColor: string }> = {
  dark: { color: '#161920', symbolColor: '#e6e8ec' },
  light: { color: '#f6f7f9', symbolColor: '#1a1d23' },
};

export function titleBarOverlay(theme: TitleBarTheme): TitleBarOverlayOptions {
  return { ...overlayColors[theme], height: TITLE_BAR_HEIGHT };
}

/**
 * Hides the system title bar. macOS keeps its traffic lights, Windows and
 * Linux keep native window buttons through the title bar overlay.
 */
export function titleBarOptions(
  platform: NodeJS.Platform,
  theme: TitleBarTheme,
): BrowserWindowConstructorOptions {
  if (platform === 'darwin') {
    return { titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 11 } };
  }
  return { titleBarStyle: 'hidden', titleBarOverlay: titleBarOverlay(theme) };
}
