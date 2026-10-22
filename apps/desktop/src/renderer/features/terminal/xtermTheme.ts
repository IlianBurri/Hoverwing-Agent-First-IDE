import type { ITheme } from '@xterm/xterm';

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** ANSI colours tuned for readable contrast on our dark and light backgrounds. */
const ansiDark = {
  black: '#3a4150',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#7c9cff',
  magenta: '#d38cff',
  cyan: '#38bdf8',
  white: '#e6e8ec',
  brightBlack: '#6b7280',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#a5b8ff',
  brightMagenta: '#e5b5ff',
  brightCyan: '#7dd3fc',
  brightWhite: '#ffffff',
};

const ansiLight = {
  black: '#1a1d23',
  red: '#b91c1c',
  green: '#15803d',
  yellow: '#a16207',
  blue: '#3b5bdb',
  magenta: '#9333ea',
  cyan: '#0369a1',
  white: '#5b6370',
  brightBlack: '#4b5563',
  brightRed: '#dc2626',
  brightGreen: '#16a34a',
  brightYellow: '#b45309',
  brightBlue: '#2f4bc4',
  brightMagenta: '#7e22ce',
  brightCyan: '#0e7490',
  brightWhite: '#1a1d23',
};

export function xtermTheme(): ITheme {
  const dark = document.documentElement.dataset['theme'] !== 'light';
  return {
    background: token('--bg'),
    foreground: token('--text'),
    cursor: token('--accent'),
    cursorAccent: token('--bg'),
    selectionBackground: token('--accent-subtle'),
    ...(dark ? ansiDark : ansiLight),
  };
}
