import { useEffect, useId, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  FileInput,
  Globe,
  LoaderCircle,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { McpServerStatus, McpServerView, McpToolInfo, McpToolLevel } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import { PanelHeader } from '../../layout/PanelHeader';
import { statusOf, useMcpStore } from '../../stores/mcp';
import { openModal } from '../../stores/modals';
import { useWorkspaceStore } from '../../stores/workspace';
import {
  deleteServer,
  importFromProject,
  refreshMcp,
  setToolEnabled,
  setToolLevel,
  testServer,
  toggleServer,
} from './actions';
import styles from './McpView.module.css';

const BUILT_IN_TOOLS = [
  'browser_list_tabs',
  'browser_screenshot',
  'browser_console',
  'browser_network_errors',
  'browser_open',
];

const stateIcons: Record<McpServerStatus['state'], LucideIcon> = {
  idle: CircleDashed,
  connecting: LoaderCircle,
  connected: CircleCheck,
  error: CircleX,
};

function ToolRow({ server, tool }: { server: McpServerView; tool: McpToolInfo }) {
  const { t } = useTranslation();
  const enabledId = useId();
  return (
    <li className={styles['tool']} aria-label={tool.name}>
      <div className={styles['toolHead']}>
        <label htmlFor={enabledId} className={styles['toolName']}>
          <input
            id={enabledId}
            type="checkbox"
            checked={tool.enabled}
            onChange={(event) => void setToolEnabled(server, tool.name, event.target.checked)}
          />
          <code>{tool.name}</code>
        </label>
        <SegmentedControl<McpToolLevel>
          label={t('mcp.levelFor', { tool: tool.name })}
          options={[
            { value: 'allow', label: t('mcp.level.allow') },
            { value: 'ask', label: t('mcp.level.ask') },
            { value: 'deny', label: t('mcp.level.deny') },
          ]}
          value={tool.level}
          onChange={(level) => void setToolLevel(server, tool.name, level)}
        />
      </div>
      {tool.description && (
        <p className={styles['description']} title={tool.description}>
          {tool.description}
        </p>
      )}
    </li>
  );
}

function ServerRow({
  server,
  status,
}: {
  server: McpServerView;
  status: McpServerStatus | undefined;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const enabledId = useId();
  const state = status?.state ?? 'idle';
  const Icon = stateIcons[state];
  const tools = status?.tools ?? [];
  const local = server.transport.type === 'stdio';
  const target =
    server.transport.type === 'stdio'
      ? [server.transport.command, ...server.transport.args].join(' ')
      : server.transport.url;

  return (
    <li className={styles['server']} aria-label={server.name}>
      <div className={styles['head']}>
        <IconButton
          size="sm"
          icon={open ? ChevronDown : ChevronRight}
          label={
            open ? t('mcp.collapse', { name: server.name }) : t('mcp.expand', { name: server.name })
          }
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            if (!open && state === 'idle' && server.enabled) void testServer(server);
          }}
        />
        <span className={styles['name']}>{server.name}</span>
        <span className={`${styles['state'] ?? ''} ${styles[state] ?? ''}`}>
          <Icon size={12} aria-hidden="true" />
          {t(`mcp.state.${state}`)}
        </span>
        <div className={styles['actions']}>
          <IconButton
            size="sm"
            icon={RefreshCw}
            label={t('mcp.testName', { name: server.name })}
            disabled={state === 'connecting' || !server.enabled}
            onClick={() => {
              setOpen(true);
              void testServer(server);
            }}
          />
          <IconButton
            size="sm"
            icon={Pencil}
            label={t('mcp.editName', { name: server.name })}
            onClick={() => {
              openModal({ id: 'mcpServer', server });
            }}
          />
          <IconButton
            size="sm"
            icon={Trash2}
            label={t('mcp.deleteName', { name: server.name })}
            onClick={() => void deleteServer(server)}
          />
        </div>
      </div>
      <div className={styles['meta']}>
        <label htmlFor={enabledId} className={styles['switch']}>
          <input
            id={enabledId}
            type="checkbox"
            checked={server.enabled}
            onChange={(event) => void toggleServer(server, event.target.checked)}
          />
          {t('mcp.enabled')}
        </label>
        <span className={styles['kind']} title={target}>
          {local ? (
            <Terminal size={12} aria-hidden="true" />
          ) : (
            <Globe size={12} aria-hidden="true" />
          )}
          {local ? t('mcp.local') : t('mcp.remote')}
        </span>
        {local && (
          <span className={styles['warning']} title={t('mcp.localHint')}>
            <ShieldAlert size={12} aria-hidden="true" />
            {t('mcp.onSystem')}
          </span>
        )}
        {server.sandboxAccess && <span className={styles['tag']}>{t('mcp.forSandbox')}</span>}
      </div>
      {status?.error && <p className={styles['error']}>{status.error}</p>}
      {open && (
        <div className={styles['tools']}>
          {tools.length === 0 ? (
            <p className={styles['hint']}>
              {state === 'connecting' ? t('mcp.loadingTools') : t('mcp.noTools')}
            </p>
          ) : (
            <>
              <div className={styles['bulk']}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    for (const tool of tools) void setToolLevel(server, tool.name, 'allow');
                  }}
                >
                  {t('mcp.allowAll')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    for (const tool of tools) void setToolLevel(server, tool.name, 'deny');
                  }}
                >
                  {t('mcp.denyAll')}
                </Button>
              </div>
              <p className={styles['hint']}>{t('mcp.descriptionsUntrusted')}</p>
              <ul
                className={styles['toolList']}
                aria-label={t('mcp.toolsOf', { name: server.name })}
              >
                {tools.map((tool) => (
                  <ToolRow key={tool.name} server={server} tool={tool} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function Group({ title, servers }: { title: string; servers: readonly McpServerView[] }) {
  const statuses = useMcpStore((state) => state.statuses);
  if (servers.length === 0) return null;
  return (
    <section aria-label={title}>
      <h3 className={styles['heading']}>{title}</h3>
      <ul className={styles['list']}>
        {servers.map((server) => (
          <ServerRow
            key={`${server.scope}/${server.id}`}
            server={server}
            status={statusOf(statuses, server)}
          />
        ))}
      </ul>
    </section>
  );
}

export function McpView() {
  const { t } = useTranslation();
  const workspace = useWorkspaceStore((state) => state.info);
  const servers = useMcpStore((state) => state.servers);

  useEffect(() => {
    void refreshMcp();
  }, [workspace?.root]);

  return (
    <>
      <PanelHeader
        id="sidebar-title"
        title={t('mcp.title')}
        actions={
          <>
            {workspace && (
              <IconButton
                size="sm"
                icon={FileInput}
                label={t('mcp.importLabel')}
                onClick={() => void importFromProject()}
              />
            )}
            <IconButton
              size="sm"
              icon={Plus}
              label={t('mcp.add')}
              onClick={() => {
                openModal({ id: 'mcpServer', server: null });
              }}
            />
          </>
        }
      />
      <div className={styles['root']}>
        {servers.length === 0 ? (
          <EmptyState icon={Plug} title={t('mcp.emptyTitle')} description={t('mcp.emptyText')}>
            <Button
              variant="primary"
              onClick={() => {
                openModal({ id: 'mcpServer', server: null });
              }}
            >
              {t('mcp.add')}
            </Button>
          </EmptyState>
        ) : (
          <>
            <Group
              title={t('mcp.global')}
              servers={servers.filter((server) => server.scope === 'global')}
            />
            <Group
              title={t('mcp.project')}
              servers={servers.filter((server) => server.scope === 'project')}
            />
          </>
        )}
        <section aria-label={t('mcp.builtIn')}>
          <h3 className={styles['heading']}>{t('mcp.builtIn')}</h3>
          <p className={styles['hint']}>{t('mcp.builtInText')}</p>
          <ul className={styles['builtIn']}>
            {BUILT_IN_TOOLS.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
