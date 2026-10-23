import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '../components/SegmentedControl';
import { AgentLog } from '../features/agent';
import { PermissionLog } from '../features/permissions';
import styles from './LogsView.module.css';

type LogKind = 'permissions' | 'agent';

/** Bottom panel "Logs": permission decisions and agent diagnostics. */
export function LogsView() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<LogKind>('permissions');
  return (
    <div className={styles['root']}>
      <div className={styles['switch']}>
        <SegmentedControl
          label={t('logs.label')}
          options={[
            { value: 'permissions', label: t('logs.permissions') },
            { value: 'agent', label: t('logs.agent') },
          ]}
          value={kind}
          onChange={setKind}
        />
      </div>
      <div className={styles['content']}>
        {kind === 'permissions' ? <PermissionLog /> : <AgentLog />}
      </div>
    </div>
  );
}
