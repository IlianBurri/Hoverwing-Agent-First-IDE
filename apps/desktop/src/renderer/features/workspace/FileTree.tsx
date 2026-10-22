import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, Link2 } from 'lucide-react';
import { FilePlus, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parentPath } from '@kestrel/shared';
import type { DirEntry } from '@kestrel/shared';
import { ContextMenu } from '../../components/ContextMenu';
import type { MenuEntry } from '../../components/ContextMenu';
import { select, setExpanded, useWorkspaceStore } from '../../stores/workspace';
import { createEntry, moveEntry, renameEntry, trashEntry } from './actions';
import { iconForEntry } from './fileIcon';
import { flattenTree } from './flatten';
import type { TreeRow } from './flatten';
import styles from './FileTree.module.css';

/** Must match --size-tree-row in tokens.css. */
const ROW_HEIGHT = 24;
const DRAG_TYPE = 'application/x-kestrel-path';

interface FileTreeProps {
  /** Called when the user activates a file (click, Enter). */
  onOpenFile: (path: string) => void;
}

interface MenuState {
  x: number;
  y: number;
  entry: DirEntry | null;
}

export function FileTree({ onOpenFile }: FileTreeProps) {
  const { t } = useTranslation();
  const dirs = useWorkspaceStore((state) => state.dirs);
  const expanded = useWorkspaceStore((state) => state.expanded);
  const selected = useWorkspaceStore((state) => state.selected);
  const rows = useMemo(() => flattenTree(dirs, expanded), [dirs, expanded]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // We do not use the React Compiler, so its "incompatible library" notice
  // about TanStack Virtual's mutable instance does not apply here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const selectedIndex = rows.findIndex((row) => row.entry.path === selected);

  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
  }, [selectedIndex, virtualizer]);

  function activate(row: TreeRow) {
    select(row.entry.path);
    if (row.entry.kind === 'directory') setExpanded(row.entry.path, !row.expanded);
    else onOpenFile(row.entry.path);
  }

  function moveSelection(index: number) {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (row) select(row.entry.path);
  }

  function openMenuForSelection() {
    const row = rows[selectedIndex];
    const element = row && document.getElementById(rowId(selectedIndex));
    const rect = element?.getBoundingClientRect() ?? scrollRef.current?.getBoundingClientRect();
    setMenu({ x: (rect?.left ?? 0) + 24, y: (rect?.bottom ?? 0) - 2, entry: row?.entry ?? null });
  }

  function onKeyDown(event: KeyboardEvent) {
    const row = rows[selectedIndex];
    if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      event.preventDefault();
      openMenuForSelection();
      return;
    }
    const handlers: Record<string, () => void> = {
      ArrowDown: () => {
        moveSelection(selectedIndex + 1);
      },
      ArrowUp: () => {
        moveSelection(selectedIndex < 0 ? 0 : selectedIndex - 1);
      },
      Home: () => {
        moveSelection(0);
      },
      End: () => {
        moveSelection(rows.length - 1);
      },
      ArrowRight: () => {
        if (row?.entry.kind !== 'directory') return;
        if (row.expanded) moveSelection(selectedIndex + 1);
        else setExpanded(row.entry.path, true);
      },
      ArrowLeft: () => {
        if (!row) return;
        if (row.expanded) {
          setExpanded(row.entry.path, false);
          return;
        }
        const parent = parentPath(row.entry.path);
        if (parent !== '') select(parent);
      },
      Enter: () => {
        if (row) activate(row);
      },
      ' ': () => {
        if (row) activate(row);
      },
      F2: () => {
        if (row) void renameEntry(row.entry.path);
      },
      Delete: () => {
        if (row) void trashEntry(row.entry.path);
      },
    };
    const handler = handlers[event.key];
    if (!handler) return;
    event.preventDefault();
    handler();
  }

  function onContextMenu(event: MouseEvent, entry: DirEntry | null) {
    event.preventDefault();
    event.stopPropagation();
    if (entry) select(entry.path);
    setMenu({ x: event.clientX, y: event.clientY, entry });
  }

  function dropDirectory(entry: DirEntry | null): string {
    if (!entry) return '';
    return entry.kind === 'directory' ? entry.path : parentPath(entry.path);
  }

  function onDragOver(event: DragEvent, entry: DirEntry | null) {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(dropDirectory(entry));
  }

  function onDrop(event: DragEvent, entry: DirEntry | null) {
    const from = event.dataTransfer.getData(DRAG_TYPE);
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    if (from) void moveEntry(from, dropDirectory(entry));
  }

  const menuEntries = (entry: DirEntry | null): MenuEntry[] => {
    const dir = dropDirectory(entry);
    const items: MenuEntry[] = [
      {
        id: 'newFile',
        label: t('workspace.newFile'),
        icon: FilePlus,
        onSelect: () => void createEntry('file', dir),
      },
      {
        id: 'newFolder',
        label: t('workspace.newFolder'),
        icon: FolderPlus,
        onSelect: () => void createEntry('directory', dir),
      },
    ];
    if (!entry) return items;
    return [
      ...items,
      'separator',
      {
        id: 'rename',
        label: t('workspace.rename'),
        icon: Pencil,
        shortcut: 'F2',
        onSelect: () => void renameEntry(entry.path),
      },
      {
        id: 'trash',
        label: t('workspace.trash'),
        icon: Trash2,
        shortcut: t('workspace.deleteKey'),
        danger: true,
        onSelect: () => void trashEntry(entry.path),
      },
    ];
  };

  return (
    <>
      <div
        ref={scrollRef}
        className={[styles['scroller'], dropTarget === '' ? styles['dropRoot'] : undefined]
          .filter(Boolean)
          .join(' ')}
        role="tree"
        aria-label={t('workspace.treeLabel')}
        aria-activedescendant={selectedIndex >= 0 ? rowId(selectedIndex) : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (selectedIndex < 0 && rows[0]) select(rows[0].entry.path);
        }}
        onContextMenu={(event) => {
          onContextMenu(event, null);
        }}
        onDragOver={(event) => {
          onDragOver(event, null);
        }}
        onDragLeave={() => {
          setDropTarget(null);
        }}
        onDrop={(event) => {
          onDrop(event, null);
        }}
      >
        <div className={styles['inner']} style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            const { entry } = row;
            const Icon = iconForEntry(entry, row.expanded);
            const isDropTarget =
              dropTarget !== null && dropTarget !== '' && dropTarget === dropDirectory(entry);
            return (
              <div
                key={entry.path}
                id={rowId(item.index)}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-posinset={row.position}
                aria-setsize={row.siblings}
                aria-expanded={entry.kind === 'directory' ? row.expanded : undefined}
                aria-selected={entry.path === selected}
                aria-busy={row.loading || undefined}
                className={[
                  styles['row'],
                  entry.heavy ? styles['heavy'] : undefined,
                  isDropTarget ? styles['dropTarget'] : undefined,
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  transform: `translateY(${String(item.start)}px)`,
                  paddingLeft: `calc(var(--space-2) + ${String(row.depth)} * var(--space-3))`,
                }}
                title={entry.path}
                draggable
                onClick={() => {
                  activate(row);
                }}
                onContextMenu={(event) => {
                  onContextMenu(event, entry);
                }}
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_TYPE, entry.path);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event) => {
                  onDragOver(event, entry);
                }}
                onDrop={(event) => {
                  onDrop(event, entry);
                }}
              >
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  className={[
                    styles['chevron'],
                    entry.kind === 'directory' ? undefined : styles['hidden'],
                    row.expanded ? styles['open'] : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
                <Icon size={15} aria-hidden="true" className={styles['icon']} />
                <span className={styles['name']}>{entry.name}</span>
                {entry.symlink && (
                  <Link2
                    size={12}
                    aria-label={t('workspace.symlink')}
                    className={styles['badge']}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {menu && (
        <ContextMenu
          label={t('workspace.menuLabel')}
          x={menu.x}
          y={menu.y}
          entries={menuEntries(menu.entry)}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
    </>
  );
}

function rowId(index: number): string {
  return `file-tree-row-${String(index)}`;
}
