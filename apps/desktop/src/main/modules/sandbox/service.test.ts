import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAgentSandbox } from '@kestrel/shared';
import type { AgentConfig } from '@kestrel/shared';
import type { AttachedContainer, ContainerSpec, DockerApi } from '../docker';
import { classifyDockerError } from '../docker';
import { fakeDockerApi } from '../docker/testing';
import { SandboxService } from './service';
import { containerPty, containerTransport } from './transport';

function fakeContainer() {
  let finish: (code: number | null) => void = () => undefined;
  const done = new Promise<number | null>((resolve) => {
    finish = resolve;
  });
  const stop = vi.fn<AttachedContainer['stop']>(() => {
    finish(null);
    return Promise.resolve();
  });
  const resize = vi.fn<AttachedContainer['resize']>(() => Promise.resolve());
  const streams = {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  };
  const container: AttachedContainer = {
    id: 'c1',
    ...streams,
    wait: () => done,
    stop,
    resize,
  };
  const exit = (code: number) => {
    finish(code);
  };
  return { container, streams, stop, resize, exit };
}

function fakeDocker(overrides: Partial<DockerApi> = {}) {
  const images = new Set<string>();
  const runs: ContainerSpec[] = [];
  const buildImage = vi.fn<DockerApi['buildImage']>(async (_dir, { tag }, onLine) => {
    await Promise.resolve();
    onLine('Step 1/4');
    images.add(tag);
  });
  const removeContainer = vi.fn<DockerApi['removeContainer']>(() => Promise.resolve());
  const api: DockerApi = fakeDockerApi({
    ping: () => Promise.resolve(),
    version: () => Promise.resolve('29.0.0'),
    imageExists: (tag) => Promise.resolve(images.has(tag)),
    buildImage,
    listContainers: () => Promise.resolve(['old1', 'old2']),
    removeContainer,
    run: (spec) => {
      runs.push(spec);
      return Promise.resolve(fakeContainer().container);
    },
    ...overrides,
  });
  return { api, buildImage, removeContainer, runs };
}

let dataDir: string;
let project: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'kestrel-sandbox-'));
  project = await mkdtemp(join(tmpdir(), 'kestrel-project-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(project, { recursive: true, force: true });
});

function service(api: DockerApi, logs: string[] = []) {
  return new SandboxService({
    docker: api,
    dataDir,
    platform: 'linux',
    identity: { uid: 1000, gid: 1000 },
    hostEnv: {},
    isInstalled: () => Promise.resolve(true),
    classifyError: classifyDockerError,
    baseImage: () => 'node:22-bookworm-slim',
    packages: ['git'],
    instance: 'test',
    onLog: (line) => logs.push(line),
    onStatus: () => undefined,
  });
}

const config: AgentConfig = {
  id: 'agent-a',
  name: 'Agent A',
  command: 'node',
  args: ['agent.mjs'],
  env: [],
  reviewChanges: true,
  sandbox: { ...defaultAgentSandbox, enabled: true },
};

describe('SandboxService', () => {
  it('reports why Docker is not usable', async () => {
    const refused = Object.assign(new Error('connect'), { code: 'ENOENT' });
    const { api } = fakeDocker({ ping: () => Promise.reject(refused) });
    expect(await service(api).status()).toEqual({
      docker: 'notRunning',
      version: null,
      imageReady: false,
      preparing: false,
    });
    await expect(service(api).prepare()).rejects.toMatchObject({ code: 'sandbox_unavailable' });
  });

  it('builds the image once, also for parallel calls', async () => {
    const { api, buildImage } = fakeDocker();
    const logs: string[] = [];
    const sandbox = service(api, logs);
    expect((await sandbox.status()).imageReady).toBe(false);
    await Promise.all([sandbox.prepare(), sandbox.prepare()]);
    expect(buildImage).toHaveBeenCalledTimes(1);
    expect(buildImage.mock.calls[0]?.[1].buildArgs).toEqual({
      BASE_IMAGE: 'node:22-bookworm-slim',
      PACKAGES: 'git',
    });
    expect(logs).toContain('Step 1/4');
    expect(await sandbox.status()).toMatchObject({
      docker: 'available',
      version: '29.0.0',
      imageReady: true,
    });
    await sandbox.prepare();
    expect(buildImage).toHaveBeenCalledTimes(1);
  });

  it('turns a failed build into a user error', async () => {
    const { api } = fakeDocker({
      buildImage: () => Promise.reject(new Error('apt failed')),
    });
    const logs: string[] = [];
    await expect(service(api, logs).prepare()).rejects.toMatchObject({
      code: 'sandbox_build_failed',
    });
    expect(logs.some((line) => line.includes('apt failed'))).toBe(true);
  });

  it('starts the agent with the secret files of the project covered', async () => {
    await writeFile(join(project, '.env'), 'TOKEN=1');
    const { api, runs } = fakeDocker();
    const launch = await service(api).startAgent(config, project, { KEY: 'v' });
    expect(launch.agentRoot).toBe(project);
    const spec = runs[0];
    expect(spec?.command).toEqual(['node', 'agent.mjs']);
    expect(spec?.env['KEY']).toBe('v');
    expect(spec?.mounts).toContainEqual({
      type: 'bind',
      source: join(dataDir, 'empty'),
      target: `${project}/.env`,
      readOnly: true,
    });
    expect(spec?.labels['dev.kestrel.sandbox.instance']).toBe('test');
  });

  it('removes containers left over from an earlier run', async () => {
    const { api, removeContainer } = fakeDocker();
    await service(api).removeOrphans();
    expect(removeContainer).toHaveBeenCalledWith('old1');
    expect(removeContainer).toHaveBeenCalledWith('old2');
  });
});

describe('container transport', () => {
  it('forwards stderr lines and the exit, and stops only once', async () => {
    const { container, streams, stop } = fakeContainer();
    const transport = containerTransport(container);
    const lines: string[] = [];
    transport.onStderr((line) => lines.push(line));
    const exited = new Promise((resolve) => {
      transport.onExit(resolve);
    });
    streams.stderr.write('warning: x\n');
    transport.kill();
    transport.kill();
    expect(await exited).toBeNull();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(lines).toEqual(['warning: x']);
  });

  it('shapes a tty container like a pty', async () => {
    const { container, streams, resize, exit } = fakeContainer();
    const pty = containerPty(container);
    const data: string[] = [];
    pty.onData((chunk) => data.push(chunk));
    const exited = new Promise<{ exitCode: number }>((resolve) => {
      pty.onExit(resolve);
    });
    const written: string[] = [];
    streams.stdin.on('data', (chunk: Buffer) => written.push(chunk.toString()));
    pty.write('ls\r');
    pty.resize(100, 30);
    streams.stdout.write('hällo');
    exit(3);
    expect(await exited).toEqual({ exitCode: 3 });
    expect(data.join('')).toBe('hällo');
    expect(written).toEqual(['ls\r']);
    expect(resize).toHaveBeenCalledWith(100, 30);
  });
});
