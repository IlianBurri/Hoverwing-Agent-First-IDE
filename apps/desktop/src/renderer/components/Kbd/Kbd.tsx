import styles from './Kbd.module.css';

/** Shows a keyboard shortcut label like "Ctrl+K". */
export function Kbd({ children }: { children: string }) {
  return <kbd className={styles['root']}>{children}</kbd>;
}
