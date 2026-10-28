import { agent } from '@agentclientprotocol/sdk';
import { describe, expect, it, vi } from 'vitest';
import { MAX_AGENT_SLOTS, defaultAgentSandbox } from '@kestrel/shared';
import type { AgentConfig } from '@kestrel/shared';
import type { PermissionService } from '../permissions';
import type { SecretStore } from '../secrets';
import type { AgentConfigStore } from './configs';
import { AgentService } from './service';
import type { AgentServiceDeps } from './service';
import type { SessionHistory } from './sessions';
import { inProcessTransport } from './transport';

const config: AgentConfig = {
  id: 'test',
  name: 'Test agent',
  command: 'test',
  args: [],
  env: [],
  reviewChanges: false,
  sandbox: defaultAgentSandbox,
};

/** Each started agent gets its own session id. */
function testAgent(sessionId: string) {
  return agent({ name: 'test-agent' })
    .onRequest('initialize', () => ({ protocolVersion: 1, agentCapabilities: {} }))
    .onRequest('session/new', () => ({ sessionId }))
    .onRequest('session/prompt', () => ({ stopReason: 'end_turn' as const }));
}

function setup() {
  let started = 0;
  const statuses: { slotId: string; state: string }[] = [];
  const cancel = vi.fn();
  const deps: AgentServiceDeps = {
    configs: {
      get: (id: string) => Promise.resolve(id === config.id ? config : undefined),
      isApproved: () => Promise.resolve(true),
    } as unknown as AgentConfigStore,
    secrets: { get: () => Promise.resolve(null) } as unknown as SecretStore,
    sessions: { remember: () => Promise.resolve() } as unknown as SessionHistory,
    permissions: { cancel } as unknown as PermissionService,
    startTransport: () => {
      started++;
      return Promise.resolve(inProcessTransport(testAgent(`session-${String(started)}`)));
    },
    sandbox: { startAgent: () => Promise.reject(new Error('no sandbox')) },
    checkpoint: () => Promise.resolve(null),
    review: {
      hold: vi.fn(),
      heldContent: () => undefined,
      lockedBy: () => null,
      collectApplied: vi.fn(),
    },
    confirmStart: () => Promise.resolve(true),
    events: {
      status: (_owner, slotId, status) => statuses.push({ slotId, state: status.state }),
      event: vi.fn(),
      log: vi.fn(),
    },
    clientVersion: '0.0.0',
  };
  return { service: new AgentService(deps), statuses, cancel };
}

describe('AgentService – parallel slots', () => {
  it('runs several agents side by side, each with its own session', async () => {
    const { service, statuses } = setup();
    const a = await service.start(1, 'a', '/project', 'test');
    const b = await service.start(1, 'b', '/project', 'test');
    expect(a).toMatchObject({ state: 'ready', sessionId: 'session-1' });
    expect(b).toMatchObject({ state: 'ready', sessionId: 'session-2' });
    expect(service.slotList(1).map((slot) => slot.slotId)).toEqual(['a', 'b']);
    // Events carry the slot they belong to.
    expect(statuses.filter((entry) => entry.slotId === 'b').at(-1)?.state).toBe('ready');
    // Another window has its own slots.
    expect(service.slotList(2)).toEqual([]);
    await service.release(1);
  });

  it(`refuses more than ${String(MAX_AGENT_SLOTS)} agents per window`, async () => {
    const { service } = setup();
    for (let index = 0; index < MAX_AGENT_SLOTS; index++)
      await service.start(1, `slot-${String(index)}`, '/project', 'test');
    await expect(service.start(1, 'one-more', '/project', 'test')).rejects.toMatchObject({
      code: 'agent_limit',
    });
    // Restarting an existing slot is still fine.
    await expect(service.start(1, 'slot-0', '/project', 'test')).resolves.toMatchObject({
      state: 'ready',
    });
    await service.release(1);
  });

  it('stopping one agent cancels only its own permission questions', async () => {
    const { service, cancel } = setup();
    await service.start(1, 'a', '/project', 'test');
    await service.start(1, 'b', '/project', 'test');
    cancel.mockClear();
    await service.stop(1, 'a');
    expect(cancel).toHaveBeenCalledWith(1, 'a');
    expect(cancel).not.toHaveBeenCalledWith(1);
    expect(service.slotList(1).find((slot) => slot.slotId === 'b')?.status.state).toBe('ready');
    await service.release(1);
  });

  it('closing a slot forgets it; releasing the window stops all agents', async () => {
    const { service } = setup();
    await service.start(1, 'a', '/project', 'test');
    await service.start(1, 'b', '/project', 'test');
    await service.close(1, 'a');
    expect(service.slotList(1).map((slot) => slot.slotId)).toEqual(['b']);
    await expect(service.prompt(1, 'a', 'hi')).rejects.toMatchObject({
      code: 'agent_not_running',
    });
    await service.release(1);
    expect(service.slotList(1)).toEqual([]);
  });
});
