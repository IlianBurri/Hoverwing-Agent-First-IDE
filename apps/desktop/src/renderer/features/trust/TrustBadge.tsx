import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTrustStore } from '../../stores/trust';
import { trustProject } from './actions';

/** Status bar entry while the open project is in restricted mode. */
export function TrustBadge({ className }: { className?: string | undefined }) {
  const { t } = useTranslation();
  const trusted = useTrustStore((state) => state.trusted);
  if (trusted !== false) return null;
  return (
    <button
      type="button"
      className={className}
      title={t('trust.restrictedTitle')}
      onClick={() => void trustProject()}
    >
      <ShieldAlert size={14} aria-hidden="true" />
      {t('trust.restricted')}
    </button>
  );
}
