import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContainerInfo, DockerApi } from './api';
import { DockerPanelService, dockerError, isDockerfileName, summarizeContainer } from './panel';
import { fakeDockerApi } from './testing';

const info: ContainerInfo = {
  id: 'a'.repeat(64),
  name: 'web',
  image: 'nginx:1',
  state: 'running',
  status: 'Up 2 minutes',
  created: 1000,
  ports: [
    { privatePort: 80, publicPort: 8080, protocol: 'tcp', ip: '0.0.0.0' },
    { privatePort: 80, publicPort: 8080, protocol: 'tcp', ip: '::' },
    { privatePort: 443, publicPort: null, protocol: 'tcp', ip: null },
  ],
  labels: {},
  bindSources: [],
};

describe('summarizeContainer', () => {
  it('shows each port mapping once', () => {
    expect(summarizeContainer(info, null).ports).toEqual([
      { privatePort: 80, publicPort: 8080, protocol: 'tcp', ip: '0.0.0.0' },
      { privatePort: 443, publicPort: null, protocol: 'tcp', ip: null },
    ]);
  });

  it('marks containers of the open project and of the sandbox', () => {
    const compose = {
      ...info,
      labels: {
        'com.docker.compose.project': 'shop',
        'com.docker.compose.project.working_dir': '/home/me/shop',
      },
    };
    expect(summarizeContainer(compose, '/home/me/shop')).toMatchObject({
      inProject: true,
      composeProject: 'shop',
      sandbox: false,
    });
    expect(summarizeContainer(compose, '/home/me/other').inProject).toBe(false);
    const mounted = { ...info, bindSources: ['/home/me/shop/data'] };
    expect(summarizeContainer(mounted, '/home/me/shop').inProject).toBe(true);
    expect(summarizeContainer(mounted, '/home/me/sho').inProject).toBe(false);
    const sandbox = { ...info, labels: { 'dev.kestrel.sandbox': 'agent' } };
    expect(summarizeContainer(sandbox, null).sandbox).toBe(true);
  });

  it('maps unknown states', () => {
    expect(summarizeContainer({ ...info, state: 'weird' }, null).state).toBe('unknown');
  });
});

describe('isDockerfileName', () => {
  it('accepts the usual Dockerfile names only', () => {
    for (const name of ['Dockerfile', 'Dockerfile.dev', 'api.Dockerfile']) {
      expect(isDockerfileName(name)).toBe(true);
    }
    for (const name of ['dockerfile.txt', 'README.md', 'Dockerfiles', 'x.dockerfile']) {
      expect(isDockerfileName(name)).toBe(false);
    }
  });
});

describe('dockerError', () => {
  it('maps status codes to user errors', () => {
    expect(dockerError({ statusCode: 409 }).code).toBe('docker_conflict');
    expect(dockerError({ statusCode: 404 }).code).toBe('not_found');
    expect(dockerError(new Error('x')).code).toBe('docker_failed');
  });
});

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kestrel-panel-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function panel(overrides: Partial<DockerApi> = {}) {
  const output: string[] = [];
  const ended: { streamId: string; ok: boolean }[] = [];
  const logs: string[] = [];
  const onChanged = vi.fn();
  const service = new DockerPanelService({
    docker: fakeDockerApi(overrides),
    state: () => Promise.resolve('available'),
    onChanged,
    onOutput: (_owner, _id, data) => output.push(data),
    onStreamEnded: (_owner, streamId, ok) => ended.push({ streamId, ok }),
    onLog: (line) => logs.push(line),
  });
  return { service, output, ended, logs, onChanged };
}

describe('DockerPanelService', () => {
  it('returns no lists while Docker is not available', async () => {
    const service = new DockerPanelService({
      docker: fakeDockerApi(),
      state: () => Promise.resolve('notRunning'),
      onChanged: () => undefined,
      onOutput: () => undefined,
      onStreamEnded: () => undefined,
      onLog: () => undefined,
    });
    expect(await service.overview(null)).toEqual({
      docker: 'notRunning',
      containers: [],
      images: [],
    });
  });

  it('refreshes once for a burst of Docker events', async () => {
    vi.useFakeTimers();
    let emit: () => void = () => undefined;
    const { service, onChanged } = panel({
      watchEvents: (onChange) => {
        emit = onChange;
        return Promise.resolve(() => undefined);
      },
    });
    await service.overview(null);
    emit();
    emit();
    emit();
    await vi.advanceTimersByTimeAsync(300);
    expect(onChanged).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('logs the reason when an action fails', async () => {
    const failure = Object.assign(new Error('x'), {
      statusCode: 500,
      json: { message: 'port is already allocated' },
    });
    const { service, logs } = panel({ startContainer: () => Promise.reject(failure) });
    await expect(service.start(info.id)).rejects.toMatchObject({ code: 'docker_failed' });
    expect(logs).toEqual(['Start failed: port is already allocated']);
  });

  it('finds Dockerfiles, skipping heavy folders', async () => {
    await writeFile(join(root, 'Dockerfile'), 'FROM x');
    await mkdir(join(root, 'api'));
    await writeFile(join(root, 'api', 'Dockerfile.dev'), 'FROM x');
    await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'pkg', 'Dockerfile'), 'FROM x');
    const { service } = panel();
    expect(await service.findDockerfiles(root)).toEqual(['Dockerfile', 'api/Dockerfile.dev']);
  });

  it('builds with the Dockerfile folder as context', async () => {
    await mkdir(join(root, 'api'));
    await writeFile(join(root, 'api', 'Dockerfile.dev'), 'FROM x');
    await writeFile(join(root, 'api', 'main.js'), '');
    const buildImage = vi.fn<DockerApi['buildImage']>((_context, _options, onLine) => {
      onLine('Step 1/1 : FROM x');
      return Promise.resolve();
    });
    const { service, output, ended } = panel({ buildImage });
    const streamId = await service.build(1, root, 'api/Dockerfile.dev', 'api:dev');
    await vi.waitFor(() => {
      expect(ended).toEqual([{ streamId, ok: true }]);
    });
    const [context, options] = buildImage.mock.calls[0] ?? [];
    expect(context).toBe(join(root, 'api'));
    expect(options).toMatchObject({ tag: 'api:dev', dockerfile: 'Dockerfile.dev' });
    expect(options?.src?.sort()).toEqual(['Dockerfile.dev', 'main.js']);
    expect(output.join('')).toContain('Step 1/1 : FROM x\r\n');
    expect(output.join('')).toContain('Built api:dev.');
  });

  it('builds only Dockerfiles inside the project', async () => {
    await writeFile(join(root, 'notes.txt'), '');
    const { service } = panel();
    await expect(service.build(1, root, 'notes.txt', 'x')).rejects.toMatchObject({
      code: 'permission_denied',
    });
    await expect(service.build(1, root, '../Dockerfile', 'x')).rejects.toMatchObject({
      code: 'outside_workspace',
    });
  });

  it('reports a failed build', async () => {
    await writeFile(join(root, 'Dockerfile'), 'FROM x');
    const { service, output, ended } = panel({
      buildImage: () => Promise.reject(new Error('apt failed')),
    });
    const streamId = await service.build(1, root, 'Dockerfile', 'x');
    await vi.waitFor(() => {
      expect(ended).toEqual([{ streamId, ok: false }]);
    });
    expect(output.join('')).toContain('Build failed: apt failed');
  });

  it('streams logs until closed, only for the owning window', async () => {
    const stop = vi.fn();
    let push: (data: string) => void = () => undefined;
    const { service, output } = panel({
      followLogs: (_id, _options, onData) => {
        push = onData;
        return Promise.resolve(stop);
      },
    });
    const streamId = await service.openLogs(1, info.id);
    push('line 1\nline 2\n');
    expect(output).toEqual(['line 1\r\nline 2\r\n']);
    service.closeStream(2, streamId);
    expect(stop).not.toHaveBeenCalled();
    service.closeStream(1, streamId);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('stops all streams of a closed window', async () => {
    const stop = vi.fn();
    const { service } = panel({ followLogs: () => Promise.resolve(stop) });
    await service.openLogs(1, info.id);
    await service.openLogs(1, info.id);
    await service.openLogs(2, info.id);
    service.release(1);
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
