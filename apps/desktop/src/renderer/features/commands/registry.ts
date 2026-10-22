import { create } from 'zustand';
import type { LucideIcon } from 'lucide-react';
import { matchesKeyCombo, parseKeyCombo } from './keybindings';
import type { KeyboardLike, KeyCombo, Platform } from './keybindings';

export interface Command {
  /** Stable id, e.g. "view.toggleSidebar"; used for keybinding overrides. */
  id: string;
  /** Translated title, resolved when the palette renders. */
  title: () => string;
  /** Translated category shown before the title, e.g. "View". */
  category?: () => string;
  icon?: LucideIcon;
  /** Default key combination, e.g. "Mod+B". */
  keybinding?: string;
  /** Set to false for commands that make no sense inside the palette. */
  showInPalette?: boolean;
  /** Command is hidden and cannot run when this returns false. */
  when?: () => boolean;
  run: () => void | Promise<void>;
}

interface CommandState {
  commands: ReadonlyMap<string, Command>;
  paletteOpen: boolean;
  /** Most recently used command ids, newest first. */
  recent: readonly string[];
  setPaletteOpen: (open: boolean) => void;
}

const RECENT_LIMIT = 5;

export const useCommandStore = create<CommandState>()((set) => ({
  commands: new Map(),
  paletteOpen: false,
  recent: [],
  setPaletteOpen: (open) => {
    set({ paletteOpen: open });
  },
}));

/** Registers commands and returns a function that removes them again. */
export function registerCommands(commands: readonly Command[]): () => void {
  useCommandStore.setState((state) => {
    const next = new Map(state.commands);
    for (const command of commands) next.set(command.id, command);
    return { commands: next };
  });
  return () => {
    useCommandStore.setState((state) => {
      const next = new Map(state.commands);
      for (const command of commands) {
        if (next.get(command.id) === command) next.delete(command.id);
      }
      return { commands: next };
    });
  };
}

export function isCommandEnabled(command: Command): boolean {
  return command.when?.() ?? true;
}

export async function runCommand(id: string): Promise<boolean> {
  const command = useCommandStore.getState().commands.get(id);
  if (!command || !isCommandEnabled(command)) return false;
  useCommandStore.setState((state) => ({
    recent: [id, ...state.recent.filter((entry) => entry !== id)].slice(0, RECENT_LIMIT),
  }));
  try {
    await command.run();
  } catch (error) {
    console.error(`[commands] ${id} failed`, error);
  }
  return true;
}

/**
 * The binding that applies to a command: a user override from the settings
 * wins over the default; an empty override disables the shortcut.
 */
export function effectiveKeybinding(
  command: Command,
  overrides: Readonly<Record<string, string>>,
  platform: Platform,
): KeyCombo | null {
  const text = Object.hasOwn(overrides, command.id) ? overrides[command.id] : command.keybinding;
  return text ? parseKeyCombo(text, platform) : null;
}

/** Finds the enabled command bound to this key event, if any. */
export function findCommandForEvent(
  event: KeyboardLike,
  commands: Iterable<Command>,
  overrides: Readonly<Record<string, string>>,
  platform: Platform,
): Command | undefined {
  for (const command of commands) {
    const combo = effectiveKeybinding(command, overrides, platform);
    if (combo && matchesKeyCombo(event, combo) && isCommandEnabled(command)) return command;
  }
  return undefined;
}
