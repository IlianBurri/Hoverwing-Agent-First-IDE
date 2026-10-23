import { ShieldQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PermissionRequest } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { respond } from '../../stores/permissions';
import { DiffPreview } from './DiffPreview';
import { kindIcons, kindKey } from './kinds';
import styles from './PermissionCard.module.css';

/** "The agent wants to …": allow once, always (this project), or deny. */
export function PermissionCard({ request }: { request: PermissionRequest }) {
  const { t } = useTranslation();
  const Icon = kindIcons[request.kind];
  const key = kindKey(request.kind);
  const titleId = `permission-${request.id}`;

  return (
    <article className={styles['root']} aria-labelledby={titleId}>
      <header className={styles['header']}>
        <ShieldQuestion size={16} aria-hidden="true" className={styles['shield']} />
        <h3 id={titleId} className={styles['title']}>
          {t('permissions.wants', {
            agent: request.agentName,
            action: t(`permissions.kind.${key}`),
          })}
        </h3>
      </header>
      <p className={styles['target']}>
        <Icon size={14} aria-hidden="true" />
        <code>{request.target}</code>
      </p>
      {request.title && request.title !== request.target && (
        <p className={styles['agentText']}>
          <span className={styles['label']}>{t('permissions.agentSays')}</span> {request.title}
        </p>
      )}
      <p className={styles['why']}>{t(`permissions.why.${key}`)}</p>
      {request.diff && <DiffPreview diff={request.diff} label={t('permissions.diffLabel')} />}
      <div className={styles['actions']}>
        <Button variant="primary" onClick={() => void respond(request.id, 'allowOnce')}>
          {t('permissions.allowOnce')}
        </Button>
        <Button onClick={() => void respond(request.id, 'allowAlways')}>
          {t('permissions.allowAlways')}
        </Button>
        <Button
          variant="ghost"
          className={styles['deny']}
          onClick={() => void respond(request.id, 'deny')}
        >
          {t('permissions.deny')}
        </Button>
      </div>
    </article>
  );
}
