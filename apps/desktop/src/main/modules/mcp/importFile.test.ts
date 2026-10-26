import { describe, expect, it } from 'vitest';
import { parseMcpJson, serverIdFrom } from './importFile';

describe('parseMcpJson', () => {
  it('reads local and remote servers with their secrets', () => {
    const servers = parseMcpJson(
      JSON.stringify({
        mcpServers: {
          'File System': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
            env: { API_TOKEN: 'abc', 'bad name': 'x' },
          },
          docs: {
            type: 'http',
            url: 'https://mcp.example.com/mcp',
            headers: { Authorization: 'Bearer t' },
          },
          legacy: { type: 'sse', url: 'https://old.example.com/sse' },
          broken: { args: [] },
        },
      }),
    );
    expect(servers).toEqual([
      {
        id: 'file-system',
        name: 'File System',
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
          env: ['API_TOKEN'],
        },
        secrets: { API_TOKEN: 'abc' },
      },
      {
        id: 'docs',
        name: 'docs',
        transport: { type: 'http', url: 'https://mcp.example.com/mcp', headers: ['Authorization'] },
        secrets: { Authorization: 'Bearer t' },
      },
    ]);
  });

  it('ignores invalid files', () => {
    expect(parseMcpJson('not json')).toEqual([]);
    expect(parseMcpJson('{"servers": {}}')).toEqual([]);
  });
});

describe('serverIdFrom', () => {
  it('makes a valid id or none', () => {
    expect(serverIdFrom('My Server!')).toBe('my-server');
    expect(serverIdFrom('!!!')).toBeNull();
  });
});
