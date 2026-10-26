import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { afterEach, describe, expect, it } from 'vitest';
import { connectMcp } from './connections';
import type { McpConnection } from './connections';

const fixture = join(import.meta.dirname, '../../../../e2e/fixtures/test-mcp-server.mjs');
const env = { PATH: process.env['PATH'] ?? '' };
let connection: McpConnection | null = null;
let child: ChildProcess | null = null;

afterEach(async () => {
  await connection?.close();
  connection = null;
  child?.kill();
  child = null;
});

describe('connectMcp', () => {
  it('starts a local server, lists and calls its tools', async () => {
    const logs: string[] = [];
    connection = await connectMcp(
      {
        transport: {
          type: 'stdio',
          command: process.execPath,
          args: [fixture],
          env: ['TEST_SECRET'],
        },
        secrets: { TEST_SECRET: 's3cret' },
        cwd: import.meta.dirname,
        env,
      },
      (line) => logs.push(line),
    );
    const tools = await connection.tools();
    expect(tools.map((tool) => tool.name)).toEqual(['echo', 'injection', 'fail', 'whoami']);
    expect(tools[0]?.inputSchema).toMatchObject({ type: 'object', properties: { text: {} } });
    expect(await connection.call('echo', { text: 'hi' })).toEqual({
      content: [{ type: 'text', text: 'echo: hi' }],
      isError: false,
    });
    expect((await connection.call('fail', {})).isError).toBe(true);
    expect(await connection.call('whoami', {})).toMatchObject({
      content: [{ text: 'secret=s3cret' }],
    });
    expect(logs).toContain('test-server ready');
  });

  it('explains a missing program', async () => {
    await expect(
      connectMcp(
        {
          transport: { type: 'stdio', command: '/does/not/exist', args: [], env: [] },
          secrets: {},
          cwd: import.meta.dirname,
          env,
        },
        () => undefined,
      ),
    ).rejects.toThrow('The program was not found.');
  });

  it('connects over HTTP with secret headers', async () => {
    child = spawn(process.execPath, [fixture, '--http'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const port = await new Promise<string>((resolve) => {
      createInterface({ input: child?.stdout ?? process.stdin }).once('line', (line) => {
        resolve(line.split(' ')[1] ?? '');
      });
    });
    const url = `http://127.0.0.1:${port}/mcp`;
    await expect(
      connectMcp(
        { transport: { type: 'http', url, headers: [] }, secrets: {}, cwd: '.', env },
        () => undefined,
      ),
    ).rejects.toThrow(/refused access/);
    connection = await connectMcp(
      {
        transport: { type: 'http', url, headers: ['Authorization'] },
        secrets: { Authorization: 'Bearer test-token' },
        cwd: '.',
        env,
      },
      () => undefined,
    );
    expect(await connection.call('echo', { text: 'remote' })).toMatchObject({
      content: [{ text: 'echo: remote' }],
    });
  });
});
