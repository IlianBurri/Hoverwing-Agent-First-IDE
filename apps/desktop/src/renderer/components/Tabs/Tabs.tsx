import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface TabsProps<T extends string> {
  label: string;
  /** Prefix for element ids, must be unique on the page. */
  idPrefix: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Extra controls on the right of the tab row. */
  actions?: ReactNode;
  children: ReactNode;
}

/** WAI-ARIA tabs: arrow keys move between tabs, Home/End jump to the ends. */
export function Tabs<T extends string>({
  label,
  idPrefix,
  items,
  value,
  onChange,
  actions,
  children,
}: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  function focusTab(index: number) {
    const item = items[(index + items.length) % items.length];
    if (!item) return;
    onChange(item.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${item.id}`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    const index = items.findIndex((item) => item.id === value);
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    focusTab(target);
  }

  return (
    <div className={styles['root']}>
      <div className={styles['header']}>
        <div
          ref={listRef}
          role="tablist"
          aria-label={label}
          className={styles['list']}
          onKeyDown={onKeyDown}
        >
          {items.map((item) => {
            const selected = item.id === value;
            return (
              <button
                key={item.id}
                id={`${idPrefix}-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${idPrefix}-panel`}
                tabIndex={selected ? 0 : -1}
                className={styles['tab']}
                onClick={() => {
                  onChange(item.id);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {actions && <div className={styles['actions']}>{actions}</div>}
      </div>
      <div
        id={`${idPrefix}-panel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${value}`}
        className={styles['panel']}
      >
        {children}
      </div>
    </div>
  );
}
