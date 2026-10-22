/**
 * Key combinations are written as "Mod+Shift+P": modifiers first, then one
 * key. "Mod" is Cmd on macOS and Ctrl elsewhere, so one default works on
 * every platform.
 */
export type Platform = 'darwin' | 'win32' | 'linux' | 'other';

export interface KeyCombo {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  /** Lower-case key name, e.g. "k", "`", "f5", "escape". */
  key: string;
}

const modifierNames = ['mod', 'ctrl', 'cmd', 'meta', 'alt', 'option', 'shift'] as const;

/** Single keys that may be bound without a modifier. */
const standaloneKeys = /^(f([1-9]|1[0-9]|2[0-4])|escape)$/;

/** Returns null for invalid combos, e.g. "K" alone (would steal typing). */
export function parseKeyCombo(text: string, platform: Platform): KeyCombo | null {
  const parts = text
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  // "Mod++" means the plus key.
  if (text.trim().endsWith('++')) parts.push('+');

  const key = parts.pop();
  if (!key || (modifierNames as readonly string[]).includes(key)) return null;

  const combo: KeyCombo = { ctrl: false, meta: false, alt: false, shift: false, key };
  for (const part of parts) {
    switch (part) {
      case 'mod':
        if (platform === 'darwin') combo.meta = true;
        else combo.ctrl = true;
        break;
      case 'ctrl':
        combo.ctrl = true;
        break;
      case 'cmd':
      case 'meta':
        combo.meta = true;
        break;
      case 'alt':
      case 'option':
        combo.alt = true;
        break;
      case 'shift':
        combo.shift = true;
        break;
      default:
        return null;
    }
  }

  const hasModifier = combo.ctrl || combo.meta || combo.alt;
  if (!hasModifier && !standaloneKeys.test(key)) return null;
  return combo;
}

export interface KeyboardLike {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  key: string;
  code: string;
}

/**
 * Uses `code` for letters and digits, so shortcuts keep working with
 * Alt/Option (which changes `key` on macOS) and on non-QWERTY layouts.
 */
function eventKey(event: KeyboardLike): string {
  const letter = /^Key([A-Z])$/.exec(event.code);
  if (letter?.[1]) return letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(event.code);
  if (digit?.[1]) return digit[1];
  if (event.code === 'Backquote') return '`';
  return event.key.toLowerCase();
}

export function matchesKeyCombo(event: KeyboardLike, combo: KeyCombo): boolean {
  return (
    event.ctrlKey === combo.ctrl &&
    event.metaKey === combo.meta &&
    event.altKey === combo.alt &&
    event.shiftKey === combo.shift &&
    eventKey(event) === combo.key
  );
}

const macSymbols = { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' } as const;

function displayKey(key: string): string {
  if (key === 'escape') return 'Esc';
  if (key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Human-readable label, e.g. "⌘⇧P" on macOS and "Ctrl+Shift+P" elsewhere. */
export function formatKeyCombo(combo: KeyCombo, platform: Platform): string {
  if (platform === 'darwin') {
    const mods = (['ctrl', 'alt', 'shift', 'meta'] as const)
      .filter((mod) => combo[mod])
      .map((mod) => macSymbols[mod])
      .join('');
    return `${mods}${displayKey(combo.key)}`;
  }
  const mods: string[] = [];
  if (combo.ctrl) mods.push('Ctrl');
  if (combo.meta) mods.push('Win');
  if (combo.alt) mods.push('Alt');
  if (combo.shift) mods.push('Shift');
  return [...mods, displayKey(combo.key)].join('+');
}
