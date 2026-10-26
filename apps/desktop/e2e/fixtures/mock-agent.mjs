// A scripted ACP agent for E2E tests. It speaks the real protocol over
// stdin/stdout. Behaviour depends on the prompt text:
//   hello                  -> plan + streamed answer
//   edit <path> <text>     -> asks permission, then writes via Kestrel (fs/write_text_file)
//   direct <path> <text>   -> writes the file itself, like Claude Code does
//   twohunks <path>        -> changes lines 2 and 25 itself (two separate hunks)
//   secret                 -> tries to read .env through Kestrel
//   run <command>          -> asks permission to run a command (does not run it)
//   slow                   -> waits until cancelled
//   peek <path>            -> reads a file itself and reports its content (sandbox tests)
//   whoami                 -> reports HOME and whether it runs in the sandbox
//   mcp <tool> [arg|json]  -> calls a tool of Kestrel's MCP server and reports the result
//                             (HTTP; with MOCK_MCP_STDIO=1 via the stdio bridge)
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { RequestError, agent, ndJsonStream } from '@agentclientprotocol/sdk';

const sessions = new Map();
const viaStdio = process.env.MOCK_MCP_STDIO === '1';

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'mock', version: '1' },
  },
};

/** Calls one tool of an MCP server (as given in session/new) and returns the result. */
async function callTool(server, name, args) {
  const call = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } };
  if (server.type === 'http') {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    for (const header of server.headers) headers[header.name] = header.value;
    const post = async (body) => {
      const response = await fetch(server.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    };
    await post(initialize);
    return (await post(call)).result;
  }
  const env = { ...process.env };
  for (const variable of server.env) env[variable.name] = variable.value;
  const child = spawn(server.command, server.args, { env, stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout });
  const answer = (id) =>
    new Promise((resolve) => {
      const onLine = (line) => {
        const message = JSON.parse(line);
        if (message.id === id) {
          lines.off('line', onLine);
          resolve(message);
        }
      };
      lines.on('line', onLine);
    });
  child.stdin.write(`${JSON.stringify(initialize)}\n`);
  await answer(1);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  child.stdin.write(`${JSON.stringify(call)}\n`);
  const result = (await answer(2)).result;
  child.stdin.end();
  return result;
}
let toolId = 0;

const say = (client, sessionId, text) =>
  client.notify('session/update', {
    sessionId,
    update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
  });

const app = agent({ name: 'mock-agent' })
  .onRequest('initialize', () => ({
    protocolVersion: 1,
    agentCapabilities: { loadSession: true, mcpCapabilities: { http: !viaStdio } },
    agentInfo: { name: 'mock-agent', version: '1.0.0' },
  }))
  .onRequest('session/new', ({ params }) => {
    if (process.env.MOCK_AUTH_REQUIRED === '1') throw RequestError.authRequired();
    const sessionId = `mock-${String(sessions.size + 1)}`;
    sessions.set(sessionId, { cwd: params.cwd, cancelled: false, mcpServers: params.mcpServers });
    return { sessionId };
  })
  .onRequest('session/load', async ({ params, client }) => {
    sessions.set(params.sessionId, {
      cwd: params.cwd,
      cancelled: false,
      mcpServers: params.mcpServers,
    });
    await client.notify('session/update', {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: 'earlier question' },
      },
    });
    await say(client, params.sessionId, 'Restored answer from the earlier session.');
    return {};
  })
  .onNotification('session/cancel', ({ params }) => {
    const session = sessions.get(params.sessionId);
    if (session) session.cancelled = true;
  })
  .onRequest('session/prompt', async ({ params, client }) => {
    const { sessionId } = params;
    const session = sessions.get(sessionId);
    session.cancelled = false;
    const text = params.prompt.map((block) => (block.type === 'text' ? block.text : '')).join('');
    const [command, path, ...rest] = text.trim().split(' ');

    if (command === 'hello') {
      await client.notify('session/update', {
        sessionId,
        update: {
          sessionUpdate: 'plan',
          entries: [
            { content: 'Read the question', status: 'completed', priority: 'high' },
            { content: 'Answer politely', status: 'in_progress', priority: 'medium' },
          ],
        },
      });
      for (const chunk of ['Hello ', 'from the ', '**mock agent**.'])
        await say(client, sessionId, chunk);
    } else if (command === 'edit' || command === 'direct') {
      const absolute = join(session.cwd, path);
      const oldText = await readFile(absolute, 'utf8').catch(() => null);
      const newText = `${rest.join(' ')}\n`;
      const toolCallId = `tool-${String(++toolId)}`;
      const diff = [{ type: 'diff', path: absolute, oldText, newText }];
      await client.notify('session/update', {
        sessionId,
        update: {
          sessionUpdate: 'tool_call',
          toolCallId,
          title: `Edit ${path}`,
          kind: 'edit',
          status: 'pending',
          locations: [{ path: absolute }],
          content: diff,
        },
      });
      let ok = true;
      if (command === 'edit') {
        try {
          await client.request('fs/write_text_file', {
            sessionId,
            path: absolute,
            content: newText,
          });
        } catch {
          ok = false;
        }
      } else {
        await writeFile(absolute, newText);
      }
      await client.notify('session/update', {
        sessionId,
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId,
          status: ok ? 'completed' : 'failed',
        },
      });
      await say(
        client,
        sessionId,
        ok ? `Changed ${path}.` : `I was not allowed to change ${path}.`,
      );
    } else if (command === 'twohunks') {
      const absolute = join(session.cwd, path);
      const lines = (await readFile(absolute, 'utf8')).split('\n');
      lines[1] = 'changed near the top';
      lines[24] = 'changed near the bottom';
      await writeFile(absolute, lines.join('\n'));
      await say(client, sessionId, `Changed two places in ${path}.`);
    } else if (command === 'peek') {
      const content = await readFile(join(session.cwd, path), 'utf8').catch(
        (error) => `<${String(error.code)}>`,
      );
      await say(client, sessionId, `Content of ${path}: [${content.trim()}]`);
    } else if (command === 'mcp') {
      const server = session.mcpServers.find((entry) => entry.name === 'kestrel');
      if (!server) {
        await say(client, sessionId, 'No Kestrel MCP server.');
      } else {
        const raw = rest.join(' ');
        const args =
          path === 'browser_open' ? { url: rest[0] } : raw.startsWith('{') ? JSON.parse(raw) : {};
        try {
          const result = await callTool(server, path, args);
          const parts = result.content.map((item) =>
            item.type === 'text' ? item.text : `[${item.type} ${item.mimeType}]`,
          );
          await say(
            client,
            sessionId,
            `${result.isError ? 'Tool error' : 'Tool result'}:\n${parts.join('\n')}`,
          );
        } catch (error) {
          await say(client, sessionId, `Tool call failed: ${String(error)}`);
        }
      }
    } else if (command === 'whoami') {
      await say(
        client,
        sessionId,
        `HOME=${String(process.env.HOME)} SANDBOX=${String(process.env.KESTREL_SANDBOX ?? 'no')}`,
      );
    } else if (command === 'secret') {
      try {
        await client.request('fs/read_text_file', { sessionId, path: join(session.cwd, '.env') });
        await say(client, sessionId, 'I could read the secret file.');
      } catch {
        await say(client, sessionId, 'Reading .env was blocked.');
      }
    } else if (command === 'run') {
      const response = await client.request('session/request_permission', {
        sessionId,
        toolCall: {
          toolCallId: `tool-${String(++toolId)}`,
          title: `Run ${[path, ...rest].join(' ')}`,
          kind: 'execute',
          rawInput: { command: [path, ...rest].join(' ') },
        },
        options: [
          { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
          { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
        ],
      });
      const allowed =
        response.outcome.outcome === 'selected' && response.outcome.optionId === 'allow';
      await say(client, sessionId, allowed ? 'Command allowed.' : 'Command rejected.');
    } else if (command === 'slow') {
      await say(client, sessionId, 'Working on it…');
      for (let waited = 0; waited < 30_000 && !session.cancelled; waited += 50) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } else {
      await say(client, sessionId, `Unknown command: ${text}`);
    }
    return { stopReason: session.cancelled ? 'cancelled' : 'end_turn' };
  });

process.stderr.write('mock agent ready\n');
const connection = app.connect(
  ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)),
);
await connection.closed;
