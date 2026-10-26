import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '../components/SegmentedControl';
import { AgentLog } from '../features/agent';
import { PermissionLog } from '../features/permissions';
import { McpLog } from '../features/mcp';
import { SandboxLog } from '../features/sandbox';
import styles from './LogsView.module.css';

type LogKind = 'permissions' | 'agent' | 'sandbox' | 'mcp';

/** Bottom panel "Logs": permission decisions, agent diagnostics, sandbox builds. */
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
            { value: 'sandbox', label: t('logs.sandbox') },
            { value: 'mcp', label: t('logs.mcp') },
          ]}
          value={kind}
          onChange={setKind}
        />
      </div>
      <div className={styles['content']}>
        {kind === 'permissions' && <PermissionLog />}
        {kind === 'agent' && <AgentLog />}
        {kind === 'sandbox' && <SandboxLog />}
        {kind === 'mcp' && <McpLog />}
      </div>
    </div>
  );
}
