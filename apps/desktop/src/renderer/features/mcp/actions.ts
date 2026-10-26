import type {
  McpImportCandidate,
  McpServerConfig,
  McpServerView,
  McpToolInfo,
  McpToolLevel,
} from '@kestrel/shared';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { choose, confirm } from '../../stores/dialogs';
import { useMcpStore } from '../../stores/mcp';
import { notify } from '../../stores/toasts';

const t = i18next.t.bind(i18next);
type ServerRef = Pick<McpServerView, 'id' | 'scope'>;

/** The stored configuration of a server view (without the secret flags). */
export function configOf(view: McpServerView): McpServerConfig {
  return {
    id: view.id,
    name: view.name,
    scope: view.scope,
    enabled: view.enabled,
    sandboxAccess: view.sandboxAccess,
    transport: view.transport,
    disabledTools: view.disabledTools,
  };
}

export async function refreshMcp(): Promise<void> {
  const result = await window.kestrel.invoke('mcp:list');
  if (result.ok) useMcpStore.setState(result.data);
}

/** Saves a server and its secret values; false if it was not saved. */
export async function saveServer(
  config: McpServerConfig,
  secrets: Readonly<Record<string, string>>,
): Promise<boolean> {
  const result = await window.kestrel.invoke('mcp:save', config);
  if (!result.ok) {
    if (result.error.code !== 'mcp_not_approved') notifyError(t('mcp.save'), result.error);
    else notify('warning', t('errors.code.mcp_not_approved'));
    return false;
  }
  for (const [name, value] of Object.entries(secrets)) {
    if (!value) continue;
    const stored = await window.kestrel.invoke('mcp:setSecret', {
      id: config.id,
      scope: config.scope,
      name,
      value,
    });
    if (!stored.ok) notifyError(t('mcp.save'), stored.error);
  }
  await refreshMcp();
  notify('success', t('mcp.saved', { name: config.name }));
  return true;
}

export async function clearSecret(server: ServerRef, name: string): Promise<void> {
  await window.kestrel.invoke('mcp:setSecret', { ...server, name, value: null });
  await refreshMcp();
}

export async function deleteServer(server: McpServerView): Promise<boolean> {
  const confirmed = await confirm({
    title: t('mcp.deleteTitle', { name: server.name }),
    message: t('mcp.deleteMessage'),
    confirmLabel: t('mcp.delete'),
    danger: true,
  });
  if (!confirmed) return false;
  const result = await window.kestrel.invoke('mcp:delete', { id: server.id, scope: server.scope });
  if (!result.ok) notifyError(t('mcp.delete'), result.error);
  await refreshMcp();
  return result.ok;
}

export async function testServer(server: ServerRef): Promise<void> {
  // Show "connecting" right away; the result arrives as the new status.
  useMcpStore.setState((state) => ({
    statuses: [
      ...state.statuses.filter(
        (entry) => !(entry.id === server.id && entry.scope === server.scope),
      ),
      { ...server, state: 'connecting', error: null, tools: [] },
    ],
  }));
  const result = await window.kestrel.invoke('mcp:test', server);
  if (!result.ok) notifyError(t('mcp.test'), result.error);
  await refreshMcp();
}

export async function toggleServer(server: McpServerView, enabled: boolean): Promise<void> {
  const result = await window.kestrel.invoke('mcp:save', { ...configOf(server), enabled });
  if (!result.ok) notifyError(t('mcp.save'), result.error);
  await refreshMcp();
}

/** Shows a tool change right away; main confirms it with the next refresh. */
function updateTool(server: ServerRef, tool: string, patch: Partial<McpToolInfo>): void {
  useMcpStore.setState((state) => ({
    statuses: state.statuses.map((status) =>
      status.id === server.id && status.scope === server.scope
        ? {
            ...status,
            tools: status.tools.map((entry) =>
              entry.name === tool ? { ...entry, ...patch } : entry,
            ),
          }
        : status,
    ),
  }));
}

export async function setToolEnabled(
  server: ServerRef,
  tool: string,
  enabled: boolean,
): Promise<void> {
  updateTool(server, tool, { enabled });
  const result = await window.kestrel.invoke('mcp:setToolEnabled', { ...server, tool, enabled });
  if (!result.ok) notifyError(t('mcp.save'), result.error);
  await refreshMcp();
}

export async function setToolLevel(
  server: ServerRef,
  tool: string,
  level: McpToolLevel,
): Promise<void> {
  updateTool(server, tool, { level });
  const result = await window.kestrel.invoke('mcp:setToolLevel', { ...server, tool, level });
  if (!result.ok) notifyError(t('mcp.save'), result.error);
  await refreshMcp();
}

function describe(candidate: McpImportCandidate): string {
  const what =
    candidate.transport.type === 'stdio'
      ? [candidate.transport.command, ...candidate.transport.args].join(' ')
      : candidate.transport.url;
  return `• ${candidate.name}: ${what}`;
}

/** Imports the servers of the project's .mcp.json after showing what they are. */
export async function importFromProject(): Promise<void> {
  const preview = await window.kestrel.invoke('mcp:previewImport');
  if (!preview.ok) {
    notifyError(t('mcp.import'), preview.error);
    return;
  }
  const candidates = preview.data.filter((candidate) => !candidate.exists);
  if (candidates.length === 0) {
    notify('info', preview.data.length === 0 ? t('mcp.importNone') : t('mcp.importNothingNew'));
    return;
  }
  const answer = await choose({
    title: t('mcp.importTitle', { count: candidates.length }),
    message: `${t('mcp.importMessage')}\n\n${candidates.map(describe).join('\n')}`,
    choices: [{ id: 'import', label: t('mcp.import'), variant: 'primary' }],
  });
  if (answer !== 'import') return;
  const result = await window.kestrel.invoke('mcp:import', {
    ids: candidates.map((candidate) => candidate.id),
  });
  if (!result.ok) {
    notifyError(t('mcp.import'), result.error);
    return;
  }
  await refreshMcp();
  notify('success', t('mcp.imported', { count: result.data.imported }));
}
