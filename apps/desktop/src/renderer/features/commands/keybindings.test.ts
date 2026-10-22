import { describe, expect, it } from 'vitest';
import { formatKeyCombo, matchesKeyCombo, parseKeyCombo } from './keybindings';
import type { KeyboardLike } from './keybindings';

function press(code: string, key: string, mods: Partial<KeyboardLike> = {}): KeyboardLike {
  return { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, code, key, ...mods };
}

describe('parseKeyCombo', () => {
  it('maps Mod to Cmd on macOS and Ctrl elsewhere', () => {
    expect(parseKeyCombo('Mod+K', 'darwin')).toMatchObject({ meta: true, ctrl: false, key: 'k' });
    expect(parseKeyCombo('Mod+K', 'linux')).toMatchObject({ meta: false, ctrl: true, key: 'k' });
  });

  it('rejects plain keys that would block typing', () => {
    expect(parseKeyCombo('K', 'linux')).toBeNull();
    expect(parseKeyCombo('Shift+K', 'linux')).toBeNull();
  });

  it('allows function keys and Escape without modifier', () => {
    expect(parseKeyCombo('F5', 'win32')).toMatchObject({ key: 'f5' });
    expect(parseKeyCombo('Escape', 'win32')).toMatchObject({ key: 'escape' });
  });

  it('rejects unknown modifiers and empty combos', () => {
    expect(parseKeyCombo('Hyper+K', 'linux')).toBeNull();
    expect(parseKeyCombo('Mod+Shift', 'linux')).toBeNull();
    expect(parseKeyCombo('', 'linux')).toBeNull();
  });

  it('supports the plus key', () => {
    expect(parseKeyCombo('Mod++', 'linux')).toMatchObject({ ctrl: true, key: '+' });
  });
});

describe('matchesKeyCombo', () => {
  const combo = parseKeyCombo('Mod+Shift+P', 'linux');

  it('matches the exact modifiers', () => {
    expect(
      combo && matchesKeyCombo(press('KeyP', 'P', { ctrlKey: true, shiftKey: true }), combo),
    ).toBe(true);
    expect(combo && matchesKeyCombo(press('KeyP', 'p', { ctrlKey: true }), combo)).toBe(false);
  });

  it('uses the physical key for letters (Alt on macOS changes event.key)', () => {
    const altCombo = parseKeyCombo('Mod+Alt+B', 'darwin');
    const event = press('KeyB', '∫', { metaKey: true, altKey: true });
    expect(altCombo && matchesKeyCombo(event, altCombo)).toBe(true);
  });

  it('matches the backtick key', () => {
    const backtick = parseKeyCombo('Ctrl+`', 'linux');
    expect(backtick && matchesKeyCombo(press('Backquote', '`', { ctrlKey: true }), backtick)).toBe(
      true,
    );
  });
});

describe('formatKeyCombo', () => {
  it('uses symbols on macOS', () => {
    const combo = parseKeyCombo('Mod+Shift+P', 'darwin');
    expect(combo && formatKeyCombo(combo, 'darwin')).toBe('⇧⌘P');
  });

  it('uses words elsewhere', () => {
    const combo = parseKeyCombo('Mod+Alt+B', 'win32');
    expect(combo && formatKeyCombo(combo, 'win32')).toBe('Ctrl+Alt+B');
  });
});
