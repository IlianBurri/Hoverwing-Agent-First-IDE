import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RequestError, agent } from '@agentclientprotocol/sdk';
import type { AgentContext } from '@agentclientprotocol/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConfig, AgentEvent, AgentStatus } from '@kestrel/shared';
import type { PermissionService } from '../permissions';
import { AgentRuntime, sliceLines } from './runtime';
import { inProcessTransport } from './transport';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kestrel-runtime-'));
  await writeFile(join(root, 'a.ts'), 'old\n');
  await writeFile(join(root, '.env'), 'SECRET=1\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const config: AgentConfig = {
  id: 'test',
  name: 'Test agent',
  command: 'test',
  args: [],
  env: [],
  reviewChanges: false,
};

type PromptScript = (
  client: AgentContext,
  sessionId: string,
  signal: { cancelled: boolean },
) => Promise<void>;

/** A scripted ACP agent; `script` runs for each prompt. */
function scriptedAgent(script: PromptScript, options: { authRequired?: boolean } = {}) {
  const state = { cancelled: false };
  return agent({ name: 'test-agent' })
    .onRequest('initialize', () => ({
      protocolVersion: 1,
      agentCapabilities: { loadSession: true },
    }))
    .onRequest('session/new', () => {
      if (options.authRequired) throw RequestError.authRequired();
      return { sessionId: 'session-1' };
    })
    .onRequest('session/load', () => ({}))
    .onNotification('session/cancel', () => {
      state.cancelled = true;
    })
    .onRequest('session/prompt', async ({ params, client }) => {
      state.cancelled = false;
      await script(client, params.sessionId, state);
      // Read through a function: the script changes the flag while awaiting.
      const wasCancelled = (): boolean => state.cancelled;
      return { stopReason: wasCancelled() ? 'cancelled' : 'end_turn' };
    });
}

function setup(script: PromptScript, options: { allow?: boolean; authRequired?: boolean } = {}) {
  const events: AgentEvent[] = [];
  const statuses: AgentStatus[] = [];
  const check = vi.fn((_context: unknown, action: { target: string }) =>
    Promise.resolve(action.target === '.env' ? false : (options.allow ?? true)),
  );
  const permissions = { check, cancel: vi.fn() } as unknown as PermissionService;
  const runtime = new AgentRuntime({
    ownerId: 1,
    startTransport: () => Promise.resolve(inProcessTransport(scriptedAgent(script, options))),
    permissions,
    checkpoint: () => Promise.resolve('c'.repeat(40)),
    onSessionStarted: vi.fn(),
    events: {
      status: (status) => statuses.push(status),
      event: (_session, event) => events.push(event),
      log: vi.fn(),
    },
    clientVersion: '0.0.0',
  });
  const turnEnded = () =>
    vi.waitFor(() => {
      expect(events.some((event) => event.type === 'turnEnded')).toBe(true);
    });
  return { runtime, events, statuses, check, turnEnded };
}

describe('AgentRuntime', () => {
  it('starts a session and streams a turn', async () => {
    const { runtime, events, turnEnded } = setup(async (client, sessionId) => {
      await client.notify('session/update', {
        sessionId,
        update: {
          sessionUpdate: 'plan',
          entries: [{ content: 'Say hi', status: 'in_progress', priority: 'high' }],
        },
      });
      await client.notify('session/update', {
        sessionId,
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello' } },
      });
    });
    const status = await runtime.start(config, root, {});
    expect(status).toMatchObject({ state: 'ready', sessionId: 'session-1', canLoadSession: true });

    await runtime.prompt('hi');
    await turnEnded();
    expect(events.map((event) => event.type)).toEqual([
      'message',
      'turnStarted',
      'plan',
      'message',
      'turnEnded',
    ]);
    expect(events[1]).toEqual({ type: 'turnStarted', checkpointId: 'c'.repeat(40) });
    expect(events.at(-1)).toEqual({ type: 'turnEnded', stopReason: 'end_turn' });
    expect(runtime.getStatus().state).toBe('ready');
  });

  it('answers permission requests through Kestrel and picks a one-time option', async () => {
    const answers: unknown[] = [];
    const { runtime, check, turnEnded } = setup(async (client, sessionId) => {
      const response = await client.request('session/request_permission', {
        sessionId,
        toolCall: {
          toolCallId: 't1',
          title: 'Run tests',
          kind: 'execute',
          rawInput: { command: 'npm test' },
        },
        options: [
          { optionId: 'always', name: 'Always', kind: 'allow_always' },
          { optionId: 'once', name: 'Once', kind: 'allow_once' },
          { optionId: 'no', name: 'No', kind: 'reject_once' },
        ],
      });
      answers.push(response.outcome);
    });
    await runtime.start(config, root, {});
    await runtime.prompt('test');
    await turnEnded();
    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'Test agent', sessionId: 'session-1' }),
      expect.objectContaining({ kind: 'command.run', target: 'npm test' }),
    );
    expect(answers).toEqual([{ outcome: 'selected', optionId: 'once' }]);
  });

  it('writes files only with permission and only inside the project', async () => {
    const results: string[] = [];
    const { runtime, turnEnded } = setup(async (client, sessionId) => {
      await client.request('fs/write_text_file', {
        sessionId,
        path: join(root, 'a.ts'),
        content: 'new\n',
      });
      results.push('inside ok');
      try {
        await client.request('fs/write_text_file', {
          sessionId,
          path: '/tmp/outside.txt',
          content: 'x',
        });
        results.push('outside ok');
      } catch {
        results.push('outside rejected');
      }
      try {
        await client.request('fs/read_text_file', { sessionId, path: join(root, '.env') });
        results.push('secret read');
      } catch {
        results.push('secret rejected');
      }
    });
    await runtime.start(config, root, {});
    await runtime.prompt('edit');
    await turnEnded();
    expect(results).toEqual(['inside ok', 'outside rejected', 'secret rejected']);
    expect(await readFile(join(root, 'a.ts'), 'utf8')).toBe('new\n');
  });

  it('leaves files untouched when the user denies', async () => {
    const { runtime, turnEnded } = setup(
      async (client, sessionId) => {
        await client
          .request('fs/write_text_file', { sessionId, path: join(root, 'a.ts'), content: 'new\n' })
          .catch(() => undefined);
      },
      { allow: false },
    );
    await runtime.start(config, root, {});
    await runtime.prompt('edit');
    await turnEnded();
    expect(await readFile(join(root, 'a.ts'), 'utf8')).toBe('old\n');
  });

  it('cancels a running turn', async () => {
    const { runtime, events, turnEnded } = setup(async (_client, _sessionId, state) => {
      await vi.waitFor(
        () => {
          expect(state.cancelled).toBe(true);
        },
        { timeout: 2000 },
      );
    });
    await runtime.start(config, root, {});
    await runtime.prompt('slow');
    await runtime.cancel();
    await turnEnded();
    expect(events.at(-1)).toEqual({ type: 'turnEnded', stopReason: 'cancelled' });
  });

  it('reports when the agent needs a login', async () => {
    const { runtime } = setup(() => Promise.resolve(), { authRequired: true });
    const status = await runtime.start(config, root, {});
    expect(status).toMatchObject({ state: 'error', error: 'authRequired' });
  });

  it('reports a failing start', async () => {
    const runtime = new AgentRuntime({
      ownerId: 1,
      startTransport: () => Promise.reject(new Error('spawn npx ENOENT')),
      permissions: { check: vi.fn(), cancel: vi.fn() } as unknown as PermissionService,
      checkpoint: () => Promise.resolve(null),
      onSessionStarted: vi.fn(),
      events: { status: vi.fn(), event: vi.fn(), log: vi.fn() },
      clientVersion: '0.0.0',
    });
    expect(await runtime.start(config, root, {})).toMatchObject({
      state: 'error',
      error: 'spawnFailed',
    });
  });
});

describe('sliceLines', () => {
  it('returns the requested lines (1-based)', () => {
    expect(sliceLines('a\nb\nc\nd', 2, 2)).toBe('b\nc');
    expect(sliceLines('a\nb', null, null)).toBe('a\nb');
  });
});
