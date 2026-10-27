import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { extensionOf, lspServerConfigSchema } from '@kestrel/shared';
import type { LspServerConfig, LspServerView } from '@kestrel/shared';
import { readJsonFile, writeJsonFile } from '../../lib/jsonFile';

/**
 * Shipped templates. Programs are not bundled: TypeScript runs through npx
 * (downloaded on first use, pinned versions), the others must be installed.
 */
export const BUILTIN_SERVERS: readonly LspServerConfig[] = [
  {
    id: 'typescript',
    name: 'TypeScript / JavaScript',
    command: 'npx',
    args: [
      '-y',
      '-p',
      'typescript-language-server@6.0.2',
      '-p',
      'typescript@6.0.3',
      'typescript-language-server',
      '--stdio',
    ],
    extensions: ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'],
    enabled: true,
  },
  {
    id: 'python',
    name: 'Python (Pyright)',
    command: 'pyright-langserver',
    args: ['--stdio'],
    extensions: ['py', 'pyi'],
    enabled: true,
  },
  {
    id: 'rust',
    name: 'Rust (rust-analyzer)',
    command: 'rust-analyzer',
    args: [],
    extensions: ['rs'],
    enabled: true,
  },
  {
    id: 'go',
    name: 'Go (gopls)',
    command: 'gopls',
    args: [],
    extensions: ['go'],
    enabled: true,
  },
];

const fileSchema = z.object({
  /** User configurations; a builtin id here overrides the template. */
  servers: z.array(lspServerConfigSchema),
  /** Fingerprints of command lines the user confirmed natively. */
  approved: z.array(z.string()),
});
type ConfigFile = z.infer<typeof fileSchema>;

/** Identifies an exact command line; changing it needs a new confirmation. */
export function serverFingerprint(config: Pick<LspServerConfig, 'command' | 'args'>): string {
  return createHash('sha256')
    .update(JSON.stringify([config.command, ...config.args]))
    .digest('hex');
}

/** Language server configurations in the app data folder (never the project). */
export class LspConfigStore {
  private data: ConfigFile | null = null;
  private readonly file: string;

  constructor(dir: string) {
    this.file = join(dir, 'servers.json');
  }

  private async load(): Promise<ConfigFile> {
    this.data ??= await readJsonFile(this.file, fileSchema, { servers: [], approved: [] });
    return this.data;
  }

  private async save(data: ConfigFile): Promise<void> {
    this.data = data;
    await writeJsonFile(this.file, data);
  }

  async list(): Promise<LspServerView[]> {
    const data = await this.load();
    const custom = new Map(data.servers.map((server) => [server.id, server]));
    const builtinIds = new Set(BUILTIN_SERVERS.map((server) => server.id));
    const view = (config: LspServerConfig, builtin: boolean): LspServerView => ({
      ...config,
      builtin,
      approved: data.approved.includes(serverFingerprint(config)),
    });
    return [
      ...BUILTIN_SERVERS.map((template) => view(custom.get(template.id) ?? template, true)),
      ...data.servers.filter((server) => !builtinIds.has(server.id)).map((s) => view(s, false)),
    ];
  }

  async get(id: string): Promise<LspServerView | undefined> {
    return (await this.list()).find((server) => server.id === id);
  }

  /** The enabled server for a file, by extension (first match wins). */
  async forPath(path: string): Promise<LspServerView | undefined> {
    const extension = extensionOf(path);
    if (!extension) return undefined;
    return (await this.list()).find(
      (server) => server.enabled && server.extensions.includes(extension),
    );
  }

  async put(config: LspServerConfig): Promise<LspServerView> {
    const data = await this.load();
    await this.save({
      ...data,
      servers: [...data.servers.filter((server) => server.id !== config.id), config],
    });
    const saved = await this.get(config.id);
    if (!saved) throw new Error('Saved server is missing.');
    return saved;
  }

  /** Removes a custom server, or resets a builtin one to its template. */
  async remove(id: string): Promise<void> {
    const data = await this.load();
    await this.save({ ...data, servers: data.servers.filter((server) => server.id !== id) });
  }

  async approve(config: LspServerConfig): Promise<void> {
    const data = await this.load();
    const fingerprint = serverFingerprint(config);
    if (data.approved.includes(fingerprint)) return;
    await this.save({ ...data, approved: [...data.approved, fingerprint] });
  }
}
