import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { mcpServerConfigSchema } from '@kestrel/shared';
import type { McpScope, McpServerConfig } from '@kestrel/shared';
import { projectKey, readJsonFile, writeJsonFile } from '../../lib/jsonFile';

const serversSchema = z.array(mcpServerConfigSchema);
const approvedSchema = z.array(z.string());

/**
 * Identifies a local server's exact command line. Starting a new one needs
 * the user's confirmation in a native dialog (like agents).
 */
export function serverFingerprint(config: Pick<McpServerConfig, 'transport'>): string | null {
  if (config.transport.type !== 'stdio') return null;
  return createHash('sha256')
    .update(JSON.stringify(['mcp', config.transport.command, ...config.transport.args]))
    .digest('hex');
}

/**
 * MCP server configurations, global and per project. Both live in the app
 * data folder (never in the project), so agents cannot add servers.
 */
export class McpConfigStore {
  private readonly cache = new Map<string, McpServerConfig[]>();
  private approved: string[] | null = null;

  constructor(private readonly dir: string) {}

  private file(scope: McpScope, root: string | null): string | null {
    if (scope === 'global') return join(this.dir, 'servers.json');
    return root === null ? null : join(this.dir, 'projects', `${projectKey(root)}.json`);
  }

  private async load(scope: McpScope, root: string | null): Promise<McpServerConfig[]> {
    const path = this.file(scope, root);
    if (!path) return [];
    const cached = this.cache.get(path);
    if (cached) return cached;
    // The scope is implied by the file; repair it if edited by hand.
    const servers = (await readJsonFile(path, serversSchema, [])).map((server) => ({
      ...server,
      scope,
    }));
    this.cache.set(path, servers);
    return servers;
  }

  private async store(scope: McpScope, root: string | null, servers: McpServerConfig[]) {
    const path = this.file(scope, root);
    if (!path) throw new Error('No project is open.');
    this.cache.set(path, servers);
    await writeJsonFile(path, servers);
  }

  /** Global servers first, then the project's. */
  async list(root: string | null): Promise<McpServerConfig[]> {
    return [...(await this.load('global', root)), ...(await this.load('project', root))];
  }

  async get(
    root: string | null,
    scope: McpScope,
    id: string,
  ): Promise<McpServerConfig | undefined> {
    return (await this.load(scope, root)).find((server) => server.id === id);
  }

  /** Ids are unique across both scopes (they prefix the tool names). */
  async idTaken(
    root: string | null,
    config: Pick<McpServerConfig, 'id' | 'scope'>,
  ): Promise<boolean> {
    return (await this.list(root)).some(
      (server) => server.id === config.id && server.scope !== config.scope,
    );
  }

  async save(root: string | null, config: McpServerConfig): Promise<McpServerConfig> {
    const servers = await this.load(config.scope, root);
    const exists = servers.some((server) => server.id === config.id);
    await this.store(
      config.scope,
      root,
      exists
        ? servers.map((server) => (server.id === config.id ? config : server))
        : [...servers, config],
    );
    return config;
  }

  async delete(root: string | null, scope: McpScope, id: string): Promise<void> {
    const servers = await this.load(scope, root);
    await this.store(
      scope,
      root,
      servers.filter((server) => server.id !== id),
    );
  }

  private async approvals(): Promise<string[]> {
    this.approved ??= await readJsonFile(join(this.dir, 'approved.json'), approvedSchema, []);
    return this.approved;
  }

  async isApproved(config: McpServerConfig): Promise<boolean> {
    const fingerprint = serverFingerprint(config);
    return fingerprint === null || (await this.approvals()).includes(fingerprint);
  }

  async approve(config: McpServerConfig): Promise<void> {
    const fingerprint = serverFingerprint(config);
    if (fingerprint === null) return;
    const approved = await this.approvals();
    if (approved.includes(fingerprint)) return;
    this.approved = [...approved, fingerprint];
    await writeJsonFile(join(this.dir, 'approved.json'), this.approved);
  }
}
