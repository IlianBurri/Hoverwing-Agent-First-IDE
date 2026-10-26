import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { McpHost } from './server';
import type { ToolDefinition } from './tools';

const echo: ToolDefinition = {
  name: 'browser_console',
  description: 'test tool',
  params: 'tab',
  run: ({ tabId }) =>
    Promise.resolve({ content: [{ type: 'text', text: `tab=${tabId ?? 'none'}` }] }),
};

let host: McpHost;

afterEach(async () => {
  await host.close();
});

async function connect(url: string, token: string): Promise<Client> {
  const client = new Client({ name: 'test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  // See server.ts: SDK transport types vs. exactOptionalPropertyTypes.
  await client.connect(transport as unknown as Transport);
  return client;
}

describe('McpHost', () => {
  it('serves the session tools to a client with the token', async () => {
    host = new McpHost('1.0.0', () => Promise.resolve(null));
    const endpoint = await host.register(() => [echo], false);
    expect(endpoint.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(endpoint.containerUrl).toBeNull();
    const client = await connect(endpoint.url, endpoint.token);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['browser_console']);
    const result = await client.callTool({ name: 'browser_console', arguments: { tabId: 'b3' } });
    expect(result.content).toEqual([{ type: 'text', text: 'tab=b3' }]);
    await client.close();
  });

  it('rejects requests without a valid token, also after revoking', async () => {
    host = new McpHost('1.0.0', () => Promise.resolve(null));
    const endpoint = await host.register(() => [echo], false);
    const post = (token: string) =>
      fetch(endpoint.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
    expect((await post('0'.repeat(64))).status).toBe(401);
    expect((await fetch(endpoint.url, { method: 'POST' })).status).toBe(401);
    host.revoke(endpoint.id);
    expect((await post(endpoint.token)).status).toBe(401);
  });

  it('gives containers their own address when one is available', async () => {
    host = new McpHost('1.0.0', () =>
      Promise.resolve({ listen: '127.0.0.1', url: 'host.docker.internal' }),
    );
    const endpoint = await host.register(() => [echo], true);
    const port = new URL(endpoint.url).port;
    expect(endpoint.containerUrl).toBe(`http://host.docker.internal:${port}/mcp`);
  });
});
