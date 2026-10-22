import { describe, expect, it } from 'vitest';
import { belongsToShell } from './useGlobalKeybindings';

const key = (code: string, mods: Partial<KeyboardEvent> = {}) => ({
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  code,
  ...mods,
});

describe('belongsToShell', () => {
  it('leaves Ctrl+letter to the shell inside a terminal', () => {
    expect(belongsToShell(key('KeyC', { ctrlKey: true }), true, 'linux')).toBe(true);
    expect(belongsToShell(key('KeyW', { ctrlKey: true }), true, 'win32')).toBe(true);
  });

  it('keeps IDE shortcuts with Shift/Alt or outside terminals', () => {
    expect(belongsToShell(key('KeyP', { ctrlKey: true, shiftKey: true }), true, 'linux')).toBe(
      false,
    );
    expect(belongsToShell(key('Backquote', { ctrlKey: true }), true, 'linux')).toBe(false);
    expect(belongsToShell(key('KeyB', { ctrlKey: true }), false, 'linux')).toBe(false);
  });

  it('never applies on macOS, where the IDE uses Cmd', () => {
    expect(belongsToShell(key('KeyC', { ctrlKey: true }), true, 'darwin')).toBe(false);
  });
});
