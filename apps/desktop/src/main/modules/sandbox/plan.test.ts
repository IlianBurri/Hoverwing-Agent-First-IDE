import { describe, expect, it } from 'vitest';
import type { AgentContainerInput } from './plan';
import { agentContainerPlan, containerRoot, loginContainerSpec } from './plan';

const input: AgentContainerInput = {
  platform: 'linux',
  root: '/home/me/project',
  agentId: 'claude-code',
  image: 'kestrel-sandbox:abc',
  command: 'npx',
  args: ['-y', 'agent@1'],
  env: { API_KEY: 'secret' },
  hostEnv: { HTTPS_PROXY: 'http://proxy:3128', AWS_SECRET_ACCESS_KEY: 'host-secret', PATH: '/x' },
  identity: { uid: 1001, gid: 1002 },
  hidden: { files: ['.env', 'sub/key.pem'], dirs: ['.ssh'] },
  emptyFile: '/data/sandbox/empty',
  limits: { memoryMb: 4096, cpus: 2 },
  labels: { 'dev.kestrel.sandbox.instance': 'i1' },
};

describe('agentContainerPlan', () => {
  it('mounts the project at the same path and covers secret files', () => {
    const { spec, agentRoot } = agentContainerPlan(input);
    expect(agentRoot).toBe('/home/me/project');
    expect(spec.workingDir).toBe('/home/me/project');
    expect(spec.mounts).toContainEqual({
      type: 'bind',
      source: '/home/me/project',
      target: '/home/me/project',
      readOnly: false,
    });
    expect(spec.mounts).toContainEqual({
      type: 'bind',
      source: '/data/sandbox/empty',
      target: '/home/me/project/.env',
      readOnly: true,
    });
    expect(spec.mounts).toContainEqual({
      type: 'bind',
      source: '/data/sandbox/empty',
      target: '/home/me/project/sub/key.pem',
      readOnly: true,
    });
    expect(spec.mounts).toContainEqual({
      type: 'tmpfs',
      target: '/home/me/project/.ssh',
      sizeMb: 1,
      mode: 0o700,
    });
  });

  it('does not mount the host home, only per-agent volumes', () => {
    const { spec } = agentContainerPlan(input);
    const binds = spec.mounts.filter((mount) => mount.type === 'bind');
    expect(binds.every((mount) => mount.source !== '/home/me')).toBe(true);
    expect(spec.mounts).toContainEqual({
      type: 'volume',
      source: 'kestrel-home-claude-code',
      target: '/home/kestrel',
    });
  });

  it('passes only proxy settings and the agent variables', () => {
    const { spec } = agentContainerPlan(input);
    expect(spec.env['API_KEY']).toBe('secret');
    expect(spec.env['HTTPS_PROXY']).toBe('http://proxy:3128');
    expect(spec.env['HOME']).toBe('/home/kestrel');
    expect(spec.env['AWS_SECRET_ACCESS_KEY']).toBeUndefined();
    expect(spec.env['PATH']).toBeUndefined();
  });

  it('runs as the host user on Linux, hardened and limited', () => {
    const { spec } = agentContainerPlan(input);
    expect(spec.user).toBe('1001:1002');
    expect(spec.command).toEqual(['npx', '-y', 'agent@1']);
    expect(spec.readOnlyRootFs).toBe(true);
    expect(spec.tty).toBe(false);
    expect(spec.memoryMb).toBe(4096);
    expect(spec.cpus).toBe(2);
    expect(spec.labels).toMatchObject({
      'dev.kestrel.sandbox': 'agent',
      'dev.kestrel.sandbox.agent': 'claude-code',
      'dev.kestrel.sandbox.instance': 'i1',
    });
  });

  it('maps the project to /workspace on Windows', () => {
    const { spec, agentRoot } = agentContainerPlan({
      ...input,
      platform: 'win32',
      root: 'C:\\Users\\me\\project',
      identity: { uid: null, gid: null },
    });
    expect(agentRoot).toBe('/workspace');
    expect(spec.mounts[0]).toEqual({
      type: 'bind',
      source: 'C:\\Users\\me\\project',
      target: '/workspace',
      readOnly: false,
    });
    expect(spec.mounts).toContainEqual(
      expect.objectContaining({ target: '/workspace/sub/key.pem' }),
    );
    expect(spec.user).toBe('1000:1000');
    expect(containerRoot('darwin', '/Users/me/p')).toBe('/Users/me/p');
  });
});

describe('loginContainerSpec', () => {
  it('opens a shell without the project, sharing the agent home', () => {
    const spec = loginContainerSpec({
      platform: 'linux',
      agentId: 'claude-code',
      image: 'kestrel-sandbox:abc',
      hostEnv: {},
      identity: { uid: 1000, gid: 1000 },
      labels: {},
    });
    expect(spec.tty).toBe(true);
    expect(spec.command).toEqual(['bash', '-l']);
    expect(spec.mounts.some((mount) => mount.type === 'bind')).toBe(false);
    expect(spec.mounts).toContainEqual({
      type: 'volume',
      source: 'kestrel-home-claude-code',
      target: '/home/kestrel',
    });
  });
});
