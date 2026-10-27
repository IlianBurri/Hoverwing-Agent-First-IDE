import { describe, expect, it } from 'vitest';
import { defaultWorkbench } from '@kestrel/shared';
import type { LayoutState } from '@kestrel/shared';
import { fakeModelClient, httpError } from '../providers/testing';
import type { FakeModelCall } from '../providers/testing';
import { LayoutAssistant } from './service';

const current: LayoutState = {
  workbench: defaultWorkbench,
  toolbar: ['git.pull', 'git.push'],
  sidebarView: 'files',
  bottomView: 'terminal',
};
const commands = [
  { id: 'git.pull', title: 'Git: Pull' },
  { id: 'git.push', title: 'Git: Push' },
  { id: 'agent.start', title: 'Agent: Start agent' },
];

function assistant(answer: (call: FakeModelCall) => string, models = ['m1', 'm2']) {
  const client = fakeModelClient(answer);
  const service = new LayoutAssistant({
    providers: { resolve: () => Promise.resolve({ client, models }) },
    model: () => ({ providerId: 'p', model: 'm1' }),
    current: () => current,
  });
  return { client, service };
}

describe('LayoutAssistant', () => {
  it('asks the chat model and returns a checked, merged layout', async () => {
    const { client, service } = assistant(() =>
      JSON.stringify({
        workbench: { sidebarSide: 'right', panels: { bottom: false } },
        toolbar: ['agent.start', 'rm-rf.command'],
        explanation: 'Sidebar right, terminal closed.',
      }),
    );
    const result = await service.propose('sidebar right, no terminal', commands);
    expect(result.model).toBe('m1');
    expect(result.explanation).toBe('Sidebar right, terminal closed.');
    expect(result.layout.workbench.sidebarSide).toBe('right');
    expect(result.layout.workbench.panels).toEqual({ sidebar: true, bottom: false, agent: true });
    expect(result.layout.toolbar).toEqual(['agent.start']);

    const [system, user] = client.calls[0]?.messages ?? [];
    expect(system?.content).toContain('- agent.start: Agent: Start agent');
    expect(user?.content).toContain('sidebar right, no terminal');
  });

  it('gives the model one chance to correct an invalid answer', async () => {
    const answers = [
      'Sure! Here is the layout: {"workbench":{"sidebarSide":"top"}}',
      '{"workbench":{"agentSide":"left"}}',
    ];
    const { client, service } = assistant(() => answers.shift() ?? '');
    const result = await service.propose('agent left', commands);
    expect(result.layout.workbench.agentSide).toBe('left');
    expect(client.calls).toHaveLength(2);
    expect(client.calls[1]?.messages?.at(-1)?.content).toContain('workbench.sidebarSide');
  });

  it('fails clearly when the answer stays invalid, without trying other models', async () => {
    const { client, service } = assistant(() => 'I cannot do that.');
    await expect(service.propose('anything', commands)).rejects.toMatchObject({
      code: 'layout_invalid',
    });
    expect(client.calls.map((call) => call.model)).toEqual(['m1', 'm1']);
  });

  it('falls back to the next model on a rate limit and maps provider errors', async () => {
    const fallback = assistant((call) => {
      if (call.model === 'm1') throw httpError(429);
      return '{"sidebarView":"git"}';
    });
    expect((await fallback.service.propose('git', commands)).model).toBe('m2');

    const down = assistant(() => {
      throw httpError(401);
    });
    await expect(down.service.propose('x', commands)).rejects.toMatchObject({
      code: 'provider_auth',
    });
  });

  it('needs a chat model', async () => {
    const service = new LayoutAssistant({
      providers: { resolve: () => Promise.reject(new Error('unused')) },
      model: () => null,
      current: () => current,
    });
    await expect(service.propose('x', commands)).rejects.toMatchObject({ code: 'model_not_set' });
  });
});
