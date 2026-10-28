// A scripted ACP agent for the README screenshots (e2e/screenshots.spec.ts).
// Whatever the prompt, it plans, reads src/forecast.ts, explains, and asks
// to write an improved version through Hoverwing (so the permission card and
// the diff are visible).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { agent, ndJsonStream } from '@agentclientprotocol/sdk';

const sessions = new Map();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const IMPROVED = `export interface Forecast {
  city: string;
  days: { date: string; high: number; low: number }[];
}

/** Fetches a forecast; rejects unknown cities and out-of-range day counts. */
export async function getForecast(city: string, days = 3): Promise<Forecast> {
  const name = city.trim();
  if (!name) throw new Error('City is required.');
  if (!Number.isInteger(days) || days < 1 || days > 14) {
    throw new RangeError('days must be between 1 and 14.');
  }
  const response = await fetch(\`https://api.example.com/forecast?city=\${encodeURIComponent(name)}&days=\${days}\`);
  if (!response.ok) throw new Error(\`Forecast failed: \${response.status}\`);
  return (await response.json()) as Forecast;
}
`;

const update = (client, sessionId, value) =>
  client.notify('session/update', { sessionId, update: value });

const say = async (client, sessionId, text) => {
  for (const part of text.split(/(?<= )/)) {
    await update(client, sessionId, {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: part },
    });
    await pause(8);
  }
};

const plan = (client, sessionId, done) =>
  update(client, sessionId, {
    sessionUpdate: 'plan',
    entries: [
      {
        content: 'Read src/forecast.ts',
        status: done > 0 ? 'completed' : 'in_progress',
        priority: 'high',
      },
      {
        content: 'Validate city and day count',
        status: done > 1 ? 'completed' : done === 1 ? 'in_progress' : 'pending',
        priority: 'high',
      },
      { content: 'Run the tests', status: 'pending', priority: 'medium' },
    ],
  });

const app = agent({ name: 'demo-agent' })
  .onRequest('initialize', () => ({
    protocolVersion: 1,
    agentCapabilities: { loadSession: false },
    agentInfo: { name: 'demo-agent', version: '1.0.0' },
  }))
  .onRequest('session/new', ({ params }) => {
    const sessionId = `demo-${String(sessions.size + 1)}`;
    sessions.set(sessionId, { cwd: params.cwd });
    return { sessionId };
  })
  .onNotification('session/cancel', () => undefined)
  .onRequest('session/prompt', async ({ params, client }) => {
    const { sessionId } = params;
    const { cwd } = sessions.get(sessionId);
    const file = join(cwd, 'src', 'forecast.ts');
    await plan(client, sessionId, 0);
    await update(client, sessionId, {
      sessionUpdate: 'tool_call',
      toolCallId: 'read-1',
      title: 'Read src/forecast.ts',
      kind: 'read',
      status: 'completed',
      locations: [{ path: file }],
    });
    const oldText = await readFile(file, 'utf8');
    await plan(client, sessionId, 1);
    await say(
      client,
      sessionId,
      '`getForecast` passes the city straight into the URL and accepts any day count. ' +
        'I will **trim and validate the city**, limit `days` to 1–14 and encode the query.',
    );
    await update(client, sessionId, {
      sessionUpdate: 'tool_call',
      toolCallId: 'edit-1',
      title: 'Edit src/forecast.ts',
      kind: 'edit',
      status: 'pending',
      locations: [{ path: file }],
      content: [{ type: 'diff', path: file, oldText, newText: IMPROVED }],
    });
    try {
      await client.request('fs/write_text_file', { sessionId, path: file, content: IMPROVED });
      await update(client, sessionId, {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'edit-1',
        status: 'completed',
      });
      await plan(client, sessionId, 2);
      await say(client, sessionId, 'The change is ready for your review. Now I run the tests.');
      const response = await client.request('session/request_permission', {
        sessionId,
        toolCall: {
          toolCallId: 'run-1',
          title: 'Run npm test',
          kind: 'execute',
          rawInput: { command: 'npm test' },
        },
        options: [
          { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
          { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
        ],
      });
      const allowed =
        response.outcome.outcome === 'selected' && response.outcome.optionId === 'allow';
      // A new paragraph: consecutive agent chunks form one message.
      await say(
        client,
        sessionId,
        allowed ? '\n\nAll 12 tests passed.' : '\n\nOkay, I skipped the tests.',
      );
    } catch {
      await say(client, sessionId, 'Okay, I left the file unchanged.');
    }
    return { stopReason: 'end_turn' };
  });

const connection = app.connect(
  ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)),
);
await connection.closed;
