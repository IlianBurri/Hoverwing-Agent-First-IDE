import { X } from 'lucide-react';
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { baseName } from '@kestrel/shared';
import { useEditorStore } from '../../stores/editor';
import { iconForEntry } from '../workspace/fileIcon';
import { activate, closeFile } from './actions';
import styles from './EditorTabs.module.css';

/** Open files as tabs. Arrow keys move, Delete/middle click closes. */
export function EditorTabs() {
  const { t } = useTranslation();
  const files = useEditorStore((state) => state.files);
  const active = useEditorStore((state) => state.active);
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent) {
    const index = files.findIndex((file) => file.path === active);
    const targets: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: files.length - 1,
    };
    if (event.key === 'Delete' && active) {
      event.preventDefault();
      void closeFile(active);
      return;
    }
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const file = files[(target + files.length) % files.length];
    if (!file) return;
    activate(file.path);
    listRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(file.path)}"]`)?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={t('editor.tabs')}
      className={styles['list']}
      onKeyDown={onKeyDown}
    >
      {files.map((file) => {
        const name = baseName(file.path);
        const selected = file.path === active;
        const Icon = iconForEntry(
          { name, path: file.path, kind: 'file', symlink: false, heavy: false },
          false,
        );
        const state = file.dirty ? t('editor.unsaved') : undefined;
        return (
          <div
            key={file.path}
            role="tab"
            data-path={file.path}
            aria-selected={selected}
            aria-label={state ? `${name} (${state})` : name}
            tabIndex={selected ? 0 : -1}
            title={file.path}
            className={[styles['tab'], file.external === 'deleted' ? styles['deleted'] : undefined]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              activate(file.path);
            }}
            onAuxClick={(event) => {
              if (event.button === 1) void closeFile(file.path);
            }}
          >
            <Icon size={14} aria-hidden="true" className={styles['icon']} />
            <span className={styles['name']}>{name}</span>
            <button
              type="button"
              tabIndex={-1}
              className={[styles['close'], file.dirty ? styles['dirty'] : undefined]
                .filter(Boolean)
                .join(' ')}
              aria-label={t('editor.closeTab', { name })}
              title={t('editor.closeTab', { name })}
              onClick={(event) => {
                event.stopPropagation();
                void closeFile(file.path);
              }}
            >
              <X size={14} aria-hidden="true" className={styles['x']} />
              <span className={styles['dot']} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
