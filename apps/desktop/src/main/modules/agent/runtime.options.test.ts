import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agent } from '@agentclientprotocol/sdk';
import type { AgentContext, SessionConfigOption } from '@agentclientprotocol/sdk';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAgentSandbox } from '@kestrel/shared';
import type { AgentConfig, AgentStatus } from '@kestrel/shared';
import type { PermissionService } from '../permissions';
import { MODEL_OPTION_ID, MODE_OPTION_ID } from './options';
import { AgentRuntime } from './runtime';
import { inProcessTransport } from './transport';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kestrel-options-'));
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
  sandbox: defaultAgentSandbox,
};

function effortOption(currentValue: string): SessionConfigOption {
  return {
    id: 'effort',
    name: 'Effort',
    category: 'thought_level',
    type: 'select',
    currentValue,
    options: [
      { value: 'low', name: 'Low' },
      { value: 'high', name: 'High' },
    ],
  };
}

/** Not in the stable protocol: the test agent needs its own parser. */
const setModelParams = z.object({ sessionId: z.string(), modelId: z.string() });

/** Offers a config option (effort), modes and the unstable model list. */
function optionsAgent(received: unknown[]) {
  let client: AgentContext | null = null;
  const app = agent({ name: 'options-agent' })
    .onRequest('initialize', ({ params }) => {
      received.push(params.clientCapabilities);
      return { protocolVersion: 1, agentCapabilities: {} };
    })
    .onRequest('session/new', ({ client: context }) => {
      client = context;
      return {
        sessionId: 'session-1',
        configOptions: [effortOption('low')],
        modes: {
          currentModeId: 'default',
          availableModes: [
            { id: 'default', name: 'Default' },
            { id: 'plan', name: 'Plan' },
            { id: 'yolo', name: 'YOLO' },
          ],
        },
        models: {
          currentModelId: 'small',
          availableModels: [
            { modelId: 'small', name: 'Small' },
            { modelId: 'large', name: 'Large' },
          ],
        },
      };
    })
    .onRequest('session/set_config_option', ({ params }) => {
      received.push(['config', params.configId, params.value]);
      return { configOptions: [effortOption(String(params.value))] };
    })
    .onRequest('session/set_mode', ({ params }) => {
      received.push(['mode', params.modeId]);
      return {};
    })
    .onRequest('session/set_model', setModelParams, ({ params }) => {
      received.push(['model', params]);
      return {};
    })
    .onRequest('session/prompt', async ({ params }) => {
      await client?.notify('session/update', {
        sessionId: params.sessionId,
        update: { sessionUpdate: 'usage_update', used: 1200, size: 200_000 },
      });
      await client?.notify('session/update', {
        sessionId: params.sessionId,
        update: { sessionUpdate: 'current_mode_update', currentModeId: 'plan' },
      });
      return { stopReason: 'end_turn' as const };
    });
  return app;
}

function setup() {
  const received: unknown[] = [];
  const statuses: AgentStatus[] = [];
  const runtime = new AgentRuntime({
    ownerId: 1,
    slotId: 'slot-1',
    startTransport: () => Promise.resolve(inProcessTransport(optionsAgent(received))),
    permissions: { check: vi.fn(), cancel: vi.fn() } as unknown as PermissionService,
    checkpoint: () => Promise.resolve(null),
    review: {
      hold: vi.fn(),
      heldContent: () => undefined,
      lockedBy: () => null,
      collectApplied: vi.fn(),
    },
    onSessionStarted: vi.fn(),
    events: { status: (status) => statuses.push(status), event: vi.fn(), log: vi.fn() },
    clientVersion: '0.0.0',
  });
  return { runtime, received, statuses };
}

describe('AgentRuntime session options', () => {
  it('reports the options the agent offers and accepts boolean options', async () => {
    const { runtime, received } = setup();
    const status = await runtime.start(config, root, {});
    expect(received[0]).toMatchObject({ session: { configOptions: { boolean: {} } } });
    expect(status.options.map((option) => [option.id, option.value])).toEqual([
      ['effort', 'low'],
      [MODE_OPTION_ID, 'default'],
      [MODEL_OPTION_ID, 'small'],
    ]);
    expect(status.options[1]?.choices.map((choice) => choice.value)).toEqual(['default', 'plan']);
  });

  it('changes config options, modes and models with the matching request', async () => {
    const { runtime, received } = setup();
    await runtime.start(config, root, {});
    await runtime.setOption('effort', 'high');
    await runtime.setOption(MODE_OPTION_ID, 'plan');
    const status = await runtime.setOption(MODEL_OPTION_ID, 'large');
    expect(received.slice(1)).toEqual([
      ['config', 'effort', 'high'],
      ['mode', 'plan'],
      ['model', { sessionId: 'session-1', modelId: 'large' }],
    ]);
    expect(status.options.map((option) => option.value)).toEqual(['high', 'plan', 'large']);
  });

  it('refuses unknown options, unlisted values and unsafe modes', async () => {
    const { runtime, received } = setup();
    await runtime.start(config, root, {});
    await expect(runtime.setOption('nope', 'x')).rejects.toMatchObject({ code: 'not_found' });
    await expect(runtime.setOption('effort', 'max')).rejects.toMatchObject({ code: 'not_found' });
    await expect(runtime.setOption(MODE_OPTION_ID, 'yolo')).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(received).toHaveLength(1);
  });

  it('follows usage and mode updates during a turn', async () => {
    const { runtime, statuses } = setup();
    await runtime.start(config, root, {});
    await runtime.prompt('hi');
    await vi.waitFor(() => {
      expect(runtime.getStatus().state).toBe('ready');
    });
    expect(runtime.getStatus().usage).toEqual({ used: 1200, size: 200_000 });
    expect(runtime.getStatus().options[1]?.value).toBe('plan');
    expect(statuses.some((status) => status.state === 'working')).toBe(true);
  });
});
