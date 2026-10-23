import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultAgentSandbox } from '@kestrel/shared';
import { AgentConfigStore, commandFingerprint } from './configs';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-configs-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('AgentConfigStore', () => {
  it('runs the templates in the sandbox when Docker is available', async () => {
    const store = new AgentConfigStore(dir, () => Promise.resolve(true));
    const agents = await store.list();
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.every((agent) => agent.sandbox.enabled)).toBe(true);
  });

  it('runs the templates directly without Docker', async () => {
    const store = new AgentConfigStore(dir, () => Promise.resolve(false));
    expect((await store.list()).every((agent) => !agent.sandbox.enabled)).toBe(true);
  });

  it('keeps the stored choice on the next start', async () => {
    await new AgentConfigStore(dir, () => Promise.resolve(true)).list();
    const again = new AgentConfigStore(dir, () => Promise.resolve(false));
    expect((await again.list()).every((agent) => agent.sandbox.enabled)).toBe(true);
  });
});

describe('commandFingerprint', () => {
  it('needs a new approval when an agent leaves the sandbox', () => {
    const line = { command: 'npx', args: ['-y', 'agent'] };
    const sandboxed = commandFingerprint({
      ...line,
      sandbox: { ...defaultAgentSandbox, enabled: true },
    });
    const direct = commandFingerprint({ ...line, sandbox: defaultAgentSandbox });
    expect(sandboxed).not.toBe(direct);
    // Limits do not matter for the approval.
    expect(
      commandFingerprint({ ...line, sandbox: { enabled: true, memoryMb: 8192, cpus: 4 } }),
    ).toBe(sandboxed);
  });
});
