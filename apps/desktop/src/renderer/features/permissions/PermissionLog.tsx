import { useEffect } from 'react';
import { CheckCircle2, ScrollText, Settings2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { openModal } from '../../stores/modals';
import { loadLog, usePermissionStore } from '../../stores/permissions';
import { useWorkspaceStore } from '../../stores/workspace';
import { kindIcons, kindKey } from './kinds';
import styles from './PermissionLog.module.css';

const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'medium',
});

/** Every allowed and denied action, newest first. */
export function PermissionLog() {
  const { t } = useTranslation();
  const log = usePermissionStore((state) => state.log);
  const root = useWorkspaceStore((state) => state.info?.root);

  useEffect(() => {
    void loadLog();
  }, [root]);

  return (
    <div className={styles['root']}>
      <div className={styles['toolbar']}>
        <h3 className={styles['heading']}>{t('permissions.log.title')}</h3>
        <Button
          variant="ghost"
          onClick={() => {
            openModal('permissionRules');
          }}
        >
          <Settings2 size={14} aria-hidden="true" />
          {t('permissions.rules.title')}
        </Button>
      </div>
      {log.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={t('permissions.log.emptyTitle')}
          description={t('permissions.log.emptyText')}
        />
      ) : (
        <table className={styles['table']} aria-label={t('permissions.log.title')}>
          <thead>
            <tr>
              <th scope="col">{t('permissions.log.time')}</th>
              <th scope="col">{t('permissions.log.agent')}</th>
              <th scope="col">{t('permissions.rules.kind')}</th>
              <th scope="col">{t('permissions.log.target')}</th>
              <th scope="col">{t('permissions.log.outcome')}</th>
            </tr>
          </thead>
          <tbody>
            {log.map((entry) => {
              const Icon = kindIcons[entry.kind];
              const allowed = entry.outcome === 'allowed';
              return (
                <tr key={entry.id}>
                  <td className={styles['muted']}>{timeFormat.format(entry.time)}</td>
                  <td>{entry.agentName}</td>
                  <td>
                    <span className={styles['cell']}>
                      <Icon size={14} aria-hidden="true" />
                      {t(`permissions.kindName.${kindKey(entry.kind)}`)}
                    </span>
                  </td>
                  <td>
                    <code>{entry.target}</code>
                  </td>
                  <td>
                    <span
                      className={[
                        styles['cell'],
                        allowed ? styles['allowed'] : styles['denied'],
                      ].join(' ')}
                    >
                      {allowed ? (
                        <CheckCircle2 size={14} aria-hidden="true" />
                      ) : (
                        <XCircle size={14} aria-hidden="true" />
                      )}
                      {t(`permissions.log.${entry.outcome}`)} ·{' '}
                      {t(`permissions.log.by.${entry.decidedBy}`)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
