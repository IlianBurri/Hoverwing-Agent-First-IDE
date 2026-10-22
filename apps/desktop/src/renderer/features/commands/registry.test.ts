import { afterEach, describe, expect, it, vi } from 'vitest';
import { findCommandForEvent, registerCommands, runCommand, useCommandStore } from './registry';
import type { Command } from './registry';

function command(id: string, overrides: Partial<Command> = {}): Command {
  return { id, title: () => id, run: vi.fn(), ...overrides };
}

const ctrlB = {
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  key: 'b',
  code: 'KeyB',
};

afterEach(() => {
  useCommandStore.setState({ commands: new Map(), recent: [] });
});

describe('command registry', () => {
  it('registers and unregisters commands', () => {
    const unregister = registerCommands([command('a'), command('b')]);
    expect([...useCommandStore.getState().commands.keys()]).toEqual(['a', 'b']);
    unregister();
    expect(useCommandStore.getState().commands.size).toBe(0);
  });

  it('runs enabled commands and remembers them as recent', async () => {
    const a = command('a');
    registerCommands([a, command('b', { when: () => false })]);
    await expect(runCommand('a')).resolves.toBe(true);
    await expect(runCommand('b')).resolves.toBe(false);
    expect(a.run).toHaveBeenCalledOnce();
    expect(useCommandStore.getState().recent).toEqual(['a']);
  });

  it('keeps running after a failing command', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerCommands([
      command('boom', {
        run: () => {
          throw new Error('nope');
        },
      }),
    ]);
    await expect(runCommand('boom')).resolves.toBe(true);
  });
});

describe('findCommandForEvent', () => {
  const toggle = command('view.toggleSidebar', { keybinding: 'Mod+B' });

  it('finds the command for its default shortcut', () => {
    expect(findCommandForEvent(ctrlB, [toggle], {}, 'linux')).toBe(toggle);
  });

  it('respects user overrides and disabled shortcuts', () => {
    expect(
      findCommandForEvent(ctrlB, [toggle], { 'view.toggleSidebar': '' }, 'linux'),
    ).toBeUndefined();
    const ctrlE = { ...ctrlB, key: 'e', code: 'KeyE' };
    expect(findCommandForEvent(ctrlE, [toggle], { 'view.toggleSidebar': 'Mod+E' }, 'linux')).toBe(
      toggle,
    );
  });

  it('supports several default shortcuts', () => {
    const palette = command('palette', { keybinding: ['Mod+K', 'Mod+Shift+P'] });
    const ctrlShiftP = { ...ctrlB, shiftKey: true, key: 'P', code: 'KeyP' };
    expect(findCommandForEvent(ctrlShiftP, [palette], {}, 'linux')).toBe(palette);
  });

  it('skips commands that are not available', () => {
    const hidden = command('x', { keybinding: 'Mod+B', when: () => false });
    expect(findCommandForEvent(ctrlB, [hidden], {}, 'linux')).toBeUndefined();
  });
});
