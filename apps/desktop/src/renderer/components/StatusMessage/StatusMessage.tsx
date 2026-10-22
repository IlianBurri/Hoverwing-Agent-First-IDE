import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './StatusMessage.module.css';

export type StatusKind = 'success' | 'warning' | 'error' | 'info';

const icons: Record<StatusKind, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

interface StatusMessageProps {
  kind: StatusKind;
  children: React.ReactNode;
}

/** Status is always shown as icon + text, never by color alone. */
export function StatusMessage({ kind, children }: StatusMessageProps) {
  const Icon = icons[kind];
  return (
    <div className={`${styles['root'] ?? ''} ${styles[kind] ?? ''}`} role="status">
      <Icon size={16} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
