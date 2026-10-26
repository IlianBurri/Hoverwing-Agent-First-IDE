import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './ContextMenu.module.css';
import { useOverlay } from '../../stores/overlays';

export interface MenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  danger?: boolean;
  onSelect: () => void;
}

export type MenuEntry = MenuItem | 'separator';

interface ContextMenuProps {
  label: string;
  x: number;
  y: number;
  entries: readonly MenuEntry[];
  onClose: () => void;
}

/**
 * Small accessible menu at a screen position. Arrow keys move, Enter
 * selects, Escape or a click outside closes and returns focus.
 */
export function ContextMenu({ label, x, y, entries, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useOverlay();
  const [position, setPosition] = useState({ x, y });
  // Captured during the first render, before the menu takes focus.
  const [returnFocus] = useState(() => document.activeElement as HTMLElement | null);

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      x: Math.min(x, window.innerWidth - width - 4),
      y: Math.min(y, window.innerHeight - height - 4),
    });
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [x, y]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    // Escape closes the menu even if focus moved elsewhere in the meantime.
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onEscape, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onEscape, true);
      window.removeEventListener('blur', onClose);
      returnFocus?.focus();
    };
  }, [onClose, returnFocus]);

  function onKeyDown(event: KeyboardEvent) {
    const buttons = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    const targets: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: buttons.length - 1,
    };
    if (event.key === 'Tab') {
      event.preventDefault();
      onClose();
      return;
    }
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    buttons[(target + buttons.length) % buttons.length]?.focus();
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={styles['menu']}
      style={{ left: position.x, top: position.y }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      {entries.map((entry, index) => {
        if (entry === 'separator') {
          return (
            <div
              key={`separator-${String(index)}`}
              role="separator"
              className={styles['separator']}
            />
          );
        }
        const Icon = entry.icon;
        return (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={[styles['item'], entry.danger ? styles['danger'] : undefined]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
          >
            <span className={styles['icon']}>{Icon && <Icon size={14} aria-hidden="true" />}</span>
            <span className={styles['label']}>{entry.label}</span>
            {entry.shortcut && <span className={styles['shortcut']}>{entry.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
