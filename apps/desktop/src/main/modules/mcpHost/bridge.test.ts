import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { afterEach, describe, expect, it } from 'vitest';
import { writeBridge } from './bridge';
import { McpHost } from './server';

let dir = '';
let host: McpHost | null = null;

afterEach(async () => {
  await host?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('stdio bridge', () => {
  it('relays requests to the MCP endpoint', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kestrel-bridge-'));
    const script = await writeBridge(dir);
    host = new McpHost('1.0.0', () => Promise.resolve(null));
    const endpoint = await host.register(
      () => [
        {
          name: 'browser_list_tabs',
          description: 'test',
          params: 'none',
          run: () => Promise.resolve({ content: [{ type: 'text', text: 'no tabs' }] }),
        },
      ],
      false,
    );
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, KESTREL_MCP_URL: endpoint.url, KESTREL_MCP_TOKEN: endpoint.token },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const lines = createInterface({ input: child.stdout });
    const next = () =>
      new Promise<Record<string, unknown>>((resolve) => {
        lines.once('line', (line) => {
          resolve(JSON.parse(line) as Record<string, unknown>);
        });
      });
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      })}\n`,
    );
    expect(await next()).toMatchObject({ id: 1, result: { serverInfo: { name: 'kestrel' } } });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'browser_list_tabs', arguments: {} } })}\n`,
    );
    expect(await next()).toMatchObject({
      id: 2,
      result: { content: [{ type: 'text', text: 'no tabs' }] },
    });
    child.stdin.end();
  });
});
