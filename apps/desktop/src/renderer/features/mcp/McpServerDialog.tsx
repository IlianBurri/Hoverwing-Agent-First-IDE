import { useId, useState } from 'react';
import type { SubmitEvent } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { mcpServerConfigSchema } from '@kestrel/shared';
import type { McpScope, McpServerConfig, McpServerView } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { SegmentedControl } from '../../components/SegmentedControl';
import { closeModal } from '../../stores/modals';
import { useMcpStore } from '../../stores/mcp';
import { useWorkspaceStore } from '../../stores/workspace';
import { clearSecret, saveServer } from './actions';
import styles from './McpServerDialog.module.css';

type Kind = 'stdio' | 'http';

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'server'
  );
}

/** Add or edit an MCP server: local command or remote URL, secrets, sandbox access. */
export function McpServerDialog({ server }: { server: McpServerView | null }) {
  const { t } = useTranslation();
  const workspace = useWorkspaceStore((state) => state.info);
  const existing = useMcpStore((state) => state.servers);
  const editing = server !== null;
  const [name, setName] = useState(server?.name ?? '');
  const [scope, setScope] = useState<McpScope>(server?.scope ?? (workspace ? 'project' : 'global'));
  const [kind, setKind] = useState<Kind>(server?.transport.type ?? 'stdio');
  const [command, setCommand] = useState(
    server?.transport.type === 'stdio' ? server.transport.command : '',
  );
  const [argsText, setArgsText] = useState(
    server?.transport.type === 'stdio' ? server.transport.args.join('\n') : '',
  );
  const [url, setUrl] = useState(server?.transport.type === 'http' ? server.transport.url : '');
  const [names, setNames] = useState<string[]>(
    server
      ? server.transport.type === 'stdio'
        ? server.transport.env
        : server.transport.headers
      : [],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [sandboxAccess, setSandboxAccess] = useState(server?.sandboxAccess ?? false);
  const ids = {
    name: useId(),
    command: useId(),
    args: useId(),
    url: useId(),
    variable: useId(),
    enabled: useId(),
    sandbox: useId(),
  };

  const id = server?.id ?? slug(name);
  const idTaken = !editing && existing.some((entry) => entry.id === id);
  const config: McpServerConfig = {
    id,
    name: name.trim(),
    scope,
    enabled,
    sandboxAccess,
    transport:
      kind === 'stdio'
        ? {
            type: 'stdio',
            command: command.trim(),
            args: argsText
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
            env: names,
          }
        : { type: 'http', url: url.trim(), headers: names },
    disabledTools: server?.disabledTools ?? [],
  };
  const valid = mcpServerConfigSchema.safeParse(config).success && !idTaken;

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!valid) return;
    if (await saveServer(config, values)) closeModal();
  }

  return (
    <Modal
      title={editing ? t('mcp.editTitle', { name: server.name }) : t('mcp.addTitle')}
      onClose={closeModal}
      size="lg"
    >
      <form className={styles['form']} onSubmit={(event) => void submit(event)}>
        <label htmlFor={ids.name}>{t('mcp.name')}</label>
        <div className={styles['field']}>
          <input
            id={ids.name}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <p className={styles['hint']}>
            {idTaken ? t('mcp.idTaken', { id }) : t('mcp.idHint', { id })}
          </p>
        </div>

        <span className={styles['label']}>{t('mcp.scope')}</span>
        <SegmentedControl<McpScope>
          label={t('mcp.scope')}
          options={[
            ...(workspace || scope === 'project'
              ? [{ value: 'project' as const, label: t('mcp.project') }]
              : []),
            { value: 'global', label: t('mcp.global') },
          ]}
          value={scope}
          onChange={(value) => {
            if (!editing) setScope(value);
          }}
        />

        <span className={styles['label']}>{t('mcp.type')}</span>
        <SegmentedControl<Kind>
          label={t('mcp.type')}
          options={[
            { value: 'stdio', label: t('mcp.local') },
            { value: 'http', label: t('mcp.remote') },
          ]}
          value={kind}
          onChange={(value) => {
            setKind(value);
            setNames([]);
            setValues({});
            setSandboxAccess(value === 'http');
          }}
        />

        {kind === 'stdio' ? (
          <>
            <label htmlFor={ids.command}>{t('mcp.command')}</label>
            <input
              id={ids.command}
              value={command}
              spellCheck={false}
              placeholder="npx"
              onChange={(event) => {
                setCommand(event.target.value);
              }}
            />
            <label htmlFor={ids.args}>{t('mcp.args')}</label>
            <div className={styles['field']}>
              <textarea
                id={ids.args}
                rows={3}
                value={argsText}
                spellCheck={false}
                placeholder={'-y\n@modelcontextprotocol/server-filesystem\n.'}
                onChange={(event) => {
                  setArgsText(event.target.value);
                }}
              />
              <p className={styles['hint']}>{t('mcp.argsHint')}</p>
            </div>
          </>
        ) : (
          <>
            <label htmlFor={ids.url}>{t('mcp.url')}</label>
            <div className={styles['field']}>
              <input
                id={ids.url}
                value={url}
                spellCheck={false}
                placeholder="https://example.com/mcp"
                onChange={(event) => {
                  setUrl(event.target.value);
                }}
              />
              <p className={styles['hint']}>{t('mcp.oauthHint')}</p>
            </div>
          </>
        )}

        <span className={styles['label']}>
          {kind === 'stdio' ? t('mcp.env') : t('mcp.headers')}
        </span>
        <div className={styles['secrets']}>
          {names.map((entry) => {
            const isSet = server?.secretsSet[entry] === true;
            return (
              <div key={entry} className={styles['secretRow']}>
                <KeyRound size={14} aria-hidden="true" />
                <code>{entry}</code>
                <input
                  type="password"
                  autoComplete="off"
                  aria-label={t('mcp.secretValue', { name: entry })}
                  placeholder={isSet ? t('agents.envIsSet') : t('agents.envNotSet')}
                  value={values[entry] ?? ''}
                  onChange={(event) => {
                    setValues({ ...values, [entry]: event.target.value });
                  }}
                />
                {server?.secretsSet[entry] === true && (
                  <Button variant="ghost" onClick={() => void clearSecret(server, entry)}>
                    {t('agents.envClear')}
                  </Button>
                )}
                <IconButton
                  size="sm"
                  icon={Trash2}
                  label={t('agents.envRemove', { name: entry })}
                  onClick={() => {
                    setNames(names.filter((other) => other !== entry));
                  }}
                />
              </div>
            );
          })}
          <div className={styles['secretRow']}>
            <label htmlFor={ids.variable} className="visually-hidden">
              {t('mcp.newSecret')}
            </label>
            <input
              id={ids.variable}
              value={newName}
              spellCheck={false}
              placeholder={kind === 'stdio' ? 'API_TOKEN' : 'Authorization'}
              onChange={(event) => {
                setNewName(event.target.value.replace(/[^A-Za-z0-9_-]/g, ''));
              }}
            />
            <Button
              disabled={!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(newName) || names.includes(newName)}
              onClick={() => {
                setNames([...names, newName]);
                setNewName('');
              }}
            >
              {t('agents.envAdd')}
            </Button>
          </div>
          <p className={styles['hint']}>{t('mcp.secretsHint')}</p>
        </div>

        <span className={styles['label']}>{t('mcp.options')}</span>
        <div className={styles['options']}>
          <label htmlFor={ids.enabled} className={styles['checkbox']}>
            <input
              id={ids.enabled}
              type="checkbox"
              checked={enabled}
              onChange={(event) => {
                setEnabled(event.target.checked);
              }}
            />
            {t('mcp.enabled')}
          </label>
          <label htmlFor={ids.sandbox} className={styles['checkbox']}>
            <input
              id={ids.sandbox}
              type="checkbox"
              checked={sandboxAccess}
              onChange={(event) => {
                setSandboxAccess(event.target.checked);
              }}
            />
            {t('mcp.sandboxAccess')}
          </label>
          <p className={styles['hint']}>
            {kind === 'stdio' ? t('mcp.sandboxLocalHint') : t('mcp.sandboxRemoteHint')}
          </p>
        </div>

        <div className={styles['actions']}>
          <Button type="submit" variant="primary" disabled={!valid}>
            {t('mcp.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
