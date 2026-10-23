import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './SandboxBadge.module.css';

/** Where an agent runs: icon + text + color, never color alone. */
export function SandboxBadge({
  sandboxed,
  compact = false,
}: {
  sandboxed: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = sandboxed ? ShieldCheck : ShieldAlert;
  const text = sandboxed ? t('sandbox.badgeSandbox') : t('sandbox.badgeDirect');
  return (
    <span
      className={`${styles['root'] ?? ''} ${styles[sandboxed ? 'sandbox' : 'direct'] ?? ''}`}
      title={sandboxed ? t('sandbox.badgeSandboxHint') : t('sandbox.badgeDirectHint')}
      data-testid="sandbox-badge"
      data-sandboxed={sandboxed}
    >
      <Icon size={compact ? 12 : 14} aria-hidden="true" />
      {text}
    </span>
  );
}
