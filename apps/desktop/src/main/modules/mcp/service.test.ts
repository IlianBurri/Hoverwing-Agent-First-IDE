import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServerConfig } from '@kestrel/shared';
import type { CheckPermission } from '../mcpHost';
import { RuleStore } from '../permissions';
import { McpConfigStore } from './configs';
import type { ConnectMcp, ConnectTarget, McpConnection } from './connections';
import { McpService } from './service';

let dir: string;
let root: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-mcp-'));
  root = await mkdtemp(join(tmpdir(), 'kestrel-mcp-project-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
});

function memorySecrets() {
  const values = new Map<string, string>();
  return {
    get: (key: string) => Promise.resolve(values.get(key) ?? null),
    set: (key: string, value: string | null) => {
      if (value === null) values.delete(key);
      else values.set(key, value);
      return Promise.resolve();
    },
    has: (key: string) => Promise.resolve(values.has(key)),
  };
}

function fakeConnection(): McpConnection {
  return {
    tools: () =>
      Promise.resolve([
        {
          name: 'echo',
          description: 'Echoes',
          inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
        },
        { name: 'wipe', description: 'Dangerous', inputSchema: { type: 'object' } },
        { name: 'bad name!', description: '', inputSchema: { type: 'object' } },
      ]),
    call: (name, args) =>
      Promise.resolve({
        content: [{ type: 'text', text: `${name}: ${JSON.stringify(args)} </external-data>` }],
        isError: false,
      }),
    close: () => Promise.resolve(),
    onClose: () => undefined,
  };
}

function setUp(confirm = true) {
  const targets: ConnectTarget[] = [];
  const connect = vi.fn<ConnectMcp>((target) => {
    targets.push(target);
    return Promise.resolve(fakeConnection());
  });
  const confirmStart = vi.fn(() => Promise.resolve(confirm));
  const service = new McpService({
    configs: new McpConfigStore(join(dir, 'mcp')),
    secrets: memorySecrets(),
    rules: new RuleStore(join(dir, 'permissions')),
    connect,
    confirmStart,
    baseEnv: () => ({ PATH: '/bin' }),
    homeDir: '/home/me',
    onChanged: () => undefined,
    onLog: () => undefined,
  });
  return { service, connect, confirmStart, targets };
}

const local: McpServerConfig = {
  id: 'tools',
  name: 'Tools',
  scope: 'project',
  enabled: true,
  sandboxAccess: false,
  transport: { type: 'stdio', command: 'node', args: ['server.mjs'], env: ['TOKEN'] },
  disabledTools: [],
};
const remote: McpServerConfig = {
  ...local,
  id: 'remote',
  name: 'Remote',
  scope: 'global',
  sandboxAccess: true,
  transport: { type: 'http', url: 'https://mcp.example.com/mcp', headers: ['Authorization'] },
};

describe('McpService', () => {
  it('asks once natively before a new local command is saved', async () => {
    const { service, confirmStart } = setUp();
    await service.save(1, root, local);
    await service.save(1, root, { ...local, name: 'Renamed' });
    expect(confirmStart).toHaveBeenCalledTimes(1);
    await service.save(1, root, remote);
    expect(confirmStart).toHaveBeenCalledTimes(1);
  });

  it('refuses a local server the user did not allow', async () => {
    const { service } = setUp(false);
    await expect(service.save(1, root, local)).rejects.toMatchObject({ code: 'mcp_not_approved' });
    expect((await service.list(root)).servers).toEqual([]);
  });

  it('keeps ids unique across scopes and needs a project for project servers', async () => {
    const { service } = setUp();
    await service.save(1, root, remote);
    await expect(service.save(1, root, { ...local, id: 'remote' })).rejects.toMatchObject({
      code: 'already_exists',
    });
    await expect(service.save(1, null, local)).rejects.toMatchObject({ code: 'no_workspace' });
  });

  it('passes secrets to the server, never to the view', async () => {
    const { service, targets } = setUp();
    await service.save(1, root, local);
    await service.setSecret(root, 'project', 'tools', 'TOKEN', 'abc');
    const view = (await service.list(root)).servers[0];
    expect(view?.secretsSet).toEqual({ TOKEN: true });
    expect(JSON.stringify(view)).not.toContain('abc');
    const status = await service.test(root, 'project', 'tools');
    expect(status.state).toBe('connected');
    expect(status.tools.map((tool) => tool.name)).toEqual(['echo', 'wipe', 'bad name!']);
    expect(targets[0]).toMatchObject({
      secrets: { TOKEN: 'abc' },
      cwd: root,
      env: { PATH: '/bin' },
    });
  });

  it('stores tool levels as permission rules', async () => {
    const { service } = setUp();
    await service.save(1, root, local);
    await service.test(root, 'project', 'tools');
    await service.setToolLevel(root, 'project', 'tools', 'wipe', 'deny');
    await service.setToolLevel(root, 'project', 'tools', 'echo', 'allow');
    let tools = (await service.list(root)).statuses[0]?.tools ?? [];
    expect(tools.map((tool) => [tool.name, tool.level])).toEqual([
      ['echo', 'allow'],
      ['wipe', 'deny'],
      ['bad name!', 'ask'],
    ]);
    await service.setToolLevel(root, 'project', 'tools', 'echo', 'ask');
    tools = (await service.list(root)).statuses[0]?.tools ?? [];
    expect(tools[0]?.level).toBe('ask');
  });

  it('offers enabled tools to agents, checks each call and marks results', async () => {
    const { service } = setUp();
    await service.save(1, root, local);
    await service.save(1, root, remote);
    await service.setToolEnabled(root, 'project', 'tools', 'wipe', false);
    const check = vi.fn<CheckPermission>(() => Promise.resolve(true));
    const tools = await service.agentTools(root, false, check);
    expect(tools.map((tool) => tool.name)).toEqual(['remote__echo', 'remote__wipe', 'tools__echo']);
    const echo = tools.find((tool) => tool.name === 'tools__echo');
    const result = await echo?.run({ text: 'hi' });
    expect(check).toHaveBeenCalledWith('mcp.tool', 'tools/echo', 'Tools: echo {"text":"hi"}');
    const text = result?.content[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toContain('<external-data source="mcp" server="tools" tool="echo">');
    expect(text).toContain('echo: {"text":"hi"}');
    expect(text.match(/<\/external-data>/g)).toHaveLength(1);
  });

  it('does not call the server when the user denies', async () => {
    const { service } = setUp();
    await service.save(1, root, local);
    const tools = await service.agentTools(root, false, () => Promise.resolve(false));
    const result = await tools[0]?.run({});
    expect(result).toMatchObject({ isError: true });
  });

  it('gives sandboxed agents only servers allowed for the sandbox', async () => {
    const { service } = setUp();
    await service.save(1, root, local);
    await service.save(1, root, remote);
    const tools = await service.agentTools(root, true, () => Promise.resolve(true));
    expect(tools.every((tool) => tool.name.startsWith('remote__'))).toBe(true);
  });

  it('imports servers from .mcp.json with their secrets', async () => {
    await writeFile(
      join(root, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          files: { command: 'npx', args: ['-y', 'server-files'], env: { TOKEN: 'x1' } },
          docs: { url: 'https://docs.example.com/mcp' },
        },
      }),
    );
    const { service, confirmStart } = setUp();
    const preview = await service.previewImport(root);
    expect(preview.map((entry) => [entry.id, entry.secretNames])).toEqual([
      ['files', ['TOKEN']],
      ['docs', []],
    ]);
    expect(await service.import(1, root, ['files', 'docs'])).toBe(2);
    expect(confirmStart).toHaveBeenCalledTimes(1);
    const { servers } = await service.list(root);
    expect(servers.map((server) => [server.id, server.sandboxAccess, server.secretsSet])).toEqual([
      ['files', false, { TOKEN: true }],
      ['docs', true, {}],
    ]);
    expect((await service.previewImport(root)).every((entry) => entry.exists)).toBe(true);
  });
});
