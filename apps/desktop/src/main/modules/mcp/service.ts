import type {
  McpImportCandidate,
  McpScope,
  McpServerConfig,
  McpServerStatus,
  McpServerView,
  McpToolInfo,
  McpToolLevel,
  PermissionRule,
} from '@kestrel/shared';
import { mcpToolTarget, proxiedToolName } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { projectKey } from '../../lib/jsonFile';
import { redact } from '../../lib/redact';
import type { CheckPermission, ToolContent, ToolDefinition, ToolInputSchema } from '../mcpHost';
import { externalData } from '../mcpHost';
import type { RuleStore } from '../permissions';
import type { SecretStore } from '../secrets';
import type { McpConfigStore } from './configs';
import type { ConnectMcp, McpConnection, RemoteResult, RemoteTool } from './connections';
import { McpConnectError } from './connections';
import { readProjectMcpJson } from './importFile';

export interface McpServiceDeps {
  configs: McpConfigStore;
  secrets: Pick<SecretStore, 'get' | 'set' | 'has'>;
  rules: Pick<RuleStore, 'rulesFor' | 'add' | 'delete'>;
  connect: ConnectMcp;
  /** Asks the user (natively) whether this local server may be started. */
  confirmStart: (ownerId: number, config: McpServerConfig) => Promise<boolean>;
  /** Environment for local servers (host environment without Hoverwing internals). */
  baseEnv: () => Record<string, string>;
  /** Working folder of global local servers (no project open). */
  homeDir: string;
  onChanged: () => void;
  onLog: (line: string) => void;
}

interface Pooled {
  connection: Promise<McpConnection>;
  tools: RemoteTool[] | null;
}

/** Valid MCP tool names agents can call. */
const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

const secretNames = (config: McpServerConfig): string[] =>
  config.transport.type === 'stdio' ? config.transport.env : config.transport.headers;

/** The MCP manager: configurations, connections, tool switches and levels. */
export class McpService {
  private readonly pool = new Map<string, Pooled>();
  private readonly statuses = new Map<string, McpServerStatus>();

  constructor(private readonly deps: McpServiceDeps) {}

  private key(root: string | null, scope: McpScope, id: string): string {
    return scope === 'global' ? `global/${id}` : `${projectKey(root ?? '')}/${id}`;
  }

  private secretKey(
    root: string | null,
    config: Pick<McpServerConfig, 'scope' | 'id'>,
    name: string,
  ) {
    return `mcp:${this.key(root, config.scope, config.id)}:${name}`;
  }

  private async require(
    root: string | null,
    scope: McpScope,
    id: string,
  ): Promise<McpServerConfig> {
    if (scope === 'project' && root === null) throw new UserError('no_workspace', 'No project.');
    const config = await this.deps.configs.get(root, scope, id);
    if (!config) throw new UserError('not_found', 'Unknown MCP server.');
    return config;
  }

  private async view(root: string | null, config: McpServerConfig): Promise<McpServerView> {
    const secretsSet: Record<string, boolean> = {};
    for (const name of secretNames(config)) {
      secretsSet[name] = await this.deps.secrets.has(this.secretKey(root, config, name));
    }
    return { ...config, secretsSet };
  }

  private async rulesFor(root: string | null): Promise<PermissionRule[]> {
    return (await this.deps.rules.rulesFor(root)).filter((rule) => rule.kind === 'mcp.tool');
  }

  private static level(rules: PermissionRule[], target: string): McpToolLevel {
    const matching = rules.filter((rule) => rule.pattern === target);
    if (matching.some((rule) => rule.level === 'deny')) return 'deny';
    if (matching.some((rule) => rule.level === 'allow')) return 'allow';
    return 'ask';
  }

  private toolInfos(
    config: McpServerConfig,
    tools: RemoteTool[],
    rules: PermissionRule[],
  ): McpToolInfo[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      enabled: !config.disabledTools.includes(tool.name),
      level: McpService.level(rules, mcpToolTarget(config.id, tool.name)),
    }));
  }

  async list(
    root: string | null,
  ): Promise<{ servers: McpServerView[]; statuses: McpServerStatus[] }> {
    const configs = await this.deps.configs.list(root);
    const rules = await this.rulesFor(root);
    const servers = await Promise.all(configs.map((config) => this.view(root, config)));
    const statuses = configs.map((config): McpServerStatus => {
      const key = this.key(root, config.scope, config.id);
      const status = this.statuses.get(key);
      const tools = this.pool.get(key)?.tools ?? [];
      return {
        id: config.id,
        scope: config.scope,
        state: status?.state ?? 'idle',
        error: status?.error ?? null,
        tools: this.toolInfos(config, tools, rules),
      };
    });
    return { servers, statuses };
  }

  async save(
    ownerId: number,
    root: string | null,
    config: McpServerConfig,
  ): Promise<McpServerView> {
    if (config.scope === 'project' && root === null) {
      throw new UserError('no_workspace', 'Open a project first.');
    }
    if (await this.deps.configs.idTaken(root, config)) {
      throw new UserError('already_exists', 'A server with this id exists.');
    }
    await this.approve(ownerId, config);
    const previous = await this.deps.configs.get(root, config.scope, config.id);
    await this.deps.configs.save(root, config);
    if (
      JSON.stringify(previous?.transport) !== JSON.stringify(config.transport) ||
      !config.enabled
    ) {
      await this.disconnect(root, config.scope, config.id);
    }
    this.deps.onChanged();
    return this.view(root, config);
  }

  /** New local command lines need a native confirmation. */
  private async approve(ownerId: number, config: McpServerConfig): Promise<void> {
    if (await this.deps.configs.isApproved(config)) return;
    if (!(await this.deps.confirmStart(ownerId, config))) {
      throw new UserError('mcp_not_approved', 'The user did not allow this server.');
    }
    await this.deps.configs.approve(config);
  }

  async delete(root: string | null, scope: McpScope, id: string): Promise<void> {
    const config = await this.require(root, scope, id);
    await this.disconnect(root, scope, id);
    for (const name of secretNames(config)) {
      await this.deps.secrets.set(this.secretKey(root, config, name), null);
    }
    // Tool levels of this server are rules; remove them with it.
    for (const rule of await this.rulesFor(root)) {
      if (rule.pattern.startsWith(`${id}/`) && rule.scope === scope) {
        await this.deps.rules.delete(root, rule.id);
      }
    }
    await this.deps.configs.delete(root, scope, id);
    this.statuses.delete(this.key(root, scope, id));
    this.deps.onChanged();
  }

  async setSecret(
    root: string | null,
    scope: McpScope,
    id: string,
    name: string,
    value: string | null,
  ): Promise<void> {
    const config = await this.require(root, scope, id);
    if (!secretNames(config).includes(name)) throw new UserError('not_found', 'Unknown variable.');
    await this.deps.secrets.set(this.secretKey(root, config, name), value);
    await this.disconnect(root, scope, id);
    this.deps.onChanged();
  }

  async setToolEnabled(
    root: string | null,
    scope: McpScope,
    id: string,
    tool: string,
    enabled: boolean,
  ): Promise<void> {
    const config = await this.require(root, scope, id);
    const disabled = config.disabledTools.filter((name) => name !== tool);
    await this.deps.configs.save(root, {
      ...config,
      disabledTools: enabled ? disabled : [...disabled, tool],
    });
    this.deps.onChanged();
  }

  /** allow/deny become permission rules (same as "always allow"); ask removes them. */
  async setToolLevel(
    root: string | null,
    scope: McpScope,
    id: string,
    tool: string,
    level: McpToolLevel,
  ): Promise<void> {
    await this.require(root, scope, id);
    const target = mcpToolTarget(id, tool);
    for (const rule of await this.rulesFor(root)) {
      if (rule.pattern === target) await this.deps.rules.delete(root, rule.id);
    }
    if (level !== 'ask') {
      await this.deps.rules.add(root, { kind: 'mcp.tool', pattern: target, level, scope });
    }
    this.deps.onChanged();
  }

  private async disconnect(root: string | null, scope: McpScope, id: string): Promise<void> {
    const key = this.key(root, scope, id);
    const pooled = this.pool.get(key);
    this.pool.delete(key);
    this.statuses.delete(key);
    if (pooled) await (await pooled.connection.catch(() => null))?.close();
  }

  private setStatus(
    root: string | null,
    config: McpServerConfig,
    state: McpServerStatus['state'],
    error: string | null,
  ) {
    this.statuses.set(this.key(root, config.scope, config.id), {
      id: config.id,
      scope: config.scope,
      state,
      error,
      tools: [],
    });
    this.deps.onChanged();
  }

  /** The (shared) connection to a server, started on first use. */
  private async connection(root: string | null, config: McpServerConfig): Promise<Pooled> {
    const key = this.key(root, config.scope, config.id);
    const existing = this.pool.get(key);
    if (existing) {
      await existing.connection;
      return existing;
    }
    if (!(await this.deps.configs.isApproved(config))) {
      throw new McpConnectError('This server was not confirmed yet. Save it again to confirm.');
    }
    const secrets: Record<string, string> = {};
    for (const name of secretNames(config)) {
      const value = await this.deps.secrets.get(this.secretKey(root, config, name));
      if (value !== null) secrets[name] = value;
    }
    const pooled: Pooled = {
      tools: null,
      connection: this.deps.connect(
        {
          transport: config.transport,
          secrets,
          cwd: config.scope === 'project' && root ? root : this.deps.homeDir,
          env: this.deps.baseEnv(),
        },
        (line) => {
          this.deps.onLog(redact(`[${config.name}] ${line}`));
        },
      ),
    };
    this.pool.set(key, pooled);
    this.setStatus(root, config, 'connecting', null);
    try {
      const connection = await pooled.connection;
      connection.onClose(() => {
        if (this.pool.get(key) !== pooled) return;
        this.pool.delete(key);
        this.setStatus(root, config, 'idle', null);
      });
      pooled.tools = await connection.tools();
      this.setStatus(root, config, 'connected', null);
      return pooled;
    } catch (error) {
      this.pool.delete(key);
      const message =
        error instanceof McpConnectError ? error.message : 'The server did not answer as expected.';
      this.setStatus(root, config, 'error', message);
      throw error instanceof McpConnectError ? error : new McpConnectError(message);
    }
  }

  /** Connects anew and lists the tools ("Test connection"). */
  async test(root: string | null, scope: McpScope, id: string): Promise<McpServerStatus> {
    const config = await this.require(root, scope, id);
    await this.disconnect(root, scope, id);
    try {
      await this.connection(root, config);
    } catch {
      // The status carries the reason.
    }
    const { statuses } = await this.list(root);
    const status = statuses.find((entry) => entry.id === id && entry.scope === scope);
    if (!status) throw new UserError('not_found', 'Unknown MCP server.');
    return status;
  }

  async previewImport(root: string): Promise<McpImportCandidate[]> {
    const existing = await this.deps.configs.list(root);
    return (await readProjectMcpJson(root)).map((server) => ({
      id: server.id,
      name: server.name,
      transport: server.transport,
      secretNames: Object.keys(server.secrets),
      exists: existing.some((config) => config.id === server.id),
    }));
  }

  /** Imports servers from .mcp.json into the project scope (with confirmation). */
  async import(ownerId: number, root: string, ids: readonly string[]): Promise<number> {
    const existing = await this.deps.configs.list(root);
    let imported = 0;
    for (const server of await readProjectMcpJson(root)) {
      if (!ids.includes(server.id) || existing.some((config) => config.id === server.id)) continue;
      const config: McpServerConfig = {
        id: server.id,
        name: server.name,
        scope: 'project',
        enabled: true,
        // Local servers run on the host: not for sandboxed agents by default.
        sandboxAccess: server.transport.type === 'http',
        transport: server.transport,
        disabledTools: [],
      };
      try {
        await this.approve(ownerId, config);
      } catch {
        continue;
      }
      await this.deps.configs.save(root, config);
      for (const [name, value] of Object.entries(server.secrets)) {
        await this.deps.secrets.set(this.secretKey(root, config, name), value);
      }
      imported++;
    }
    if (imported > 0) this.deps.onChanged();
    return imported;
  }

  /**
   * Tools of the enabled servers for an agent session, ready for Hoverwing's
   * MCP host. Each call is permission-checked; results are untrusted data.
   */
  async agentTools(
    root: string | null,
    sandboxed: boolean,
    check: CheckPermission,
  ): Promise<ToolDefinition[]> {
    const tools: ToolDefinition[] = [];
    for (const config of await this.deps.configs.list(root)) {
      if (!config.enabled || (sandboxed && !config.sandboxAccess)) continue;
      let pooled: Pooled;
      try {
        pooled = await this.connection(root, config);
      } catch (error) {
        this.deps.onLog(redact(`[${config.name}] not available: ${String(error)}`));
        continue;
      }
      for (const tool of pooled.tools ?? []) {
        const name = proxiedToolName(config.id, tool.name);
        if (config.disabledTools.includes(tool.name) || !TOOL_NAME.test(name)) continue;
        tools.push(this.proxy(root, config, tool, name, check));
      }
    }
    return tools;
  }

  private proxy(
    root: string | null,
    config: McpServerConfig,
    tool: RemoteTool,
    name: string,
    check: CheckPermission,
  ): ToolDefinition {
    const inputSchema: ToolInputSchema =
      tool.inputSchema['type'] === 'object'
        ? (tool.inputSchema as ToolInputSchema)
        : { type: 'object', properties: {} };
    return {
      name,
      description: `[MCP server “${config.name}”, untrusted description] ${tool.description}`.slice(
        0,
        2000,
      ),
      inputSchema,
      run: async (args) => {
        const preview = redact(JSON.stringify(args)).slice(0, 300);
        const allowed = await check(
          'mcp.tool',
          mcpToolTarget(config.id, tool.name),
          `${config.name}: ${tool.name} ${preview}`,
        );
        if (!allowed) {
          return {
            content: [{ type: 'text', text: 'The user did not allow this.' }],
            isError: true,
          };
        }
        try {
          const pooled = await this.connection(root, config);
          const result = await (await pooled.connection).call(tool.name, args);
          return this.wrap(config, tool.name, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.deps.onLog(redact(`[${config.name}] ${tool.name} failed: ${message}`));
          return {
            content: [
              { type: 'text', text: `The MCP tool failed: ${redact(message).slice(0, 300)}` },
            ],
            isError: true,
          };
        }
      },
    };
  }

  private wrap(config: McpServerConfig, tool: string, result: RemoteResult) {
    const origin = `the MCP server “${config.name}” (tool ${tool})`;
    const attributes = { source: 'mcp', server: config.id, tool };
    const content: ToolContent[] = result.content.map((item): ToolContent => {
      if (item.type === 'text')
        return { type: 'text', text: externalData(attributes, origin, item.text) };
      if (item.type === 'image') return item;
      return {
        type: 'text',
        text: externalData(attributes, origin, item.text ?? `(${item.kind} content omitted)`),
      };
    });
    return result.isError ? { content, isError: true } : { content };
  }

  async closeAll(): Promise<void> {
    const pooled = [...this.pool.values()];
    this.pool.clear();
    await Promise.all(
      pooled.map(async (entry) => (await entry.connection.catch(() => null))?.close()),
    );
  }
}
