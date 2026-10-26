import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createDockerApi } from './dockerode';

/** Opt in with KESTREL_DOCKER_TESTS=1 (see sandbox/docker.integration.test.ts). */
const enabled = process.env['KESTREL_DOCKER_TESTS'] === '1';
const baseImage = process.env['KESTREL_SANDBOX_BASE_IMAGE'] ?? 'node:22-bookworm-slim';
const tag = 'kestrel-panel-test:latest';

describe.skipIf(!enabled)('dockerode adapter with real Docker', () => {
  const docker = createDockerApi({ socketPath: undefined });
  let context = '';

  afterAll(async () => {
    const ids = await docker.listContainers('dev.kestrel.test');
    await Promise.all(ids.map((id) => docker.removeContainer(id, { force: true })));
    const image = (await docker.listImages()).find((entry) => entry.tags.includes(tag));
    if (image) await docker.removeImage(image.id);
    if (context) await rm(context, { recursive: true, force: true });
  });

  it('builds a project Dockerfile, honouring .dockerignore', { timeout: 120_000 }, async () => {
    context = await mkdtemp(join(tmpdir(), 'kestrel-build-'));
    await writeFile(
      join(context, 'app.Dockerfile'),
      `FROM ${baseImage}\nCOPY . /app\nCMD ["sh", "-c", "ls /app; echo ready; sleep 600"]\n`,
    );
    await writeFile(join(context, 'keep.txt'), 'x');
    await writeFile(join(context, 'secret.txt'), 'x');
    await writeFile(join(context, '.dockerignore'), 'secret.txt\n');
    const lines: string[] = [];
    await docker.buildImage(
      context,
      {
        tag,
        dockerfile: 'app.Dockerfile',
        src: await readdir(context),
        buildArgs: {},
        labels: { 'dev.kestrel.test': '1' },
      },
      (line) => lines.push(line),
    );
    expect(lines.join('\n')).toMatch(/Successfully (built|tagged)/);
    expect((await docker.listImages()).some((image) => image.tags.includes(tag))).toBe(true);
  });

  it('cancels a build when aborted', { timeout: 60_000 }, async () => {
    const slow = await mkdtemp(join(tmpdir(), 'kestrel-slow-'));
    await writeFile(join(slow, 'Dockerfile'), `FROM ${baseImage}\nRUN sleep 60\n`);
    const controller = new AbortController();
    const build = docker.buildImage(
      slow,
      { tag: 'kestrel-slow-test', buildArgs: {}, labels: {}, signal: controller.signal },
      () => undefined,
    );
    setTimeout(() => {
      controller.abort();
    }, 1500);
    await expect(build).rejects.toThrow();
    await rm(slow, { recursive: true, force: true });
  });

  it('runs, lists, follows logs, stops and removes a container', { timeout: 60_000 }, async () => {
    const container = await docker.run({
      image: tag,
      command: ['sh', '-c', 'ls /app; echo ready; sleep 600'],
      env: {},
      workingDir: '/',
      user: null,
      mounts: [],
      labels: { 'dev.kestrel.test': '1' },
      tty: false,
      readOnlyRootFs: false,
      memoryMb: 256,
      cpus: 0.5,
      pidsLimit: 64,
      extraHosts: [],
    });
    const listed = (await docker.listContainerInfos()).find((entry) => entry.id === container.id);
    expect(listed).toMatchObject({ state: 'running', image: tag });

    let output = '';
    const stop = await docker.followLogs(
      container.id,
      { tail: 100 },
      (data) => {
        output += data;
      },
      () => undefined,
    );
    await expect.poll(() => output, { timeout: 10_000 }).toContain('ready');
    expect(output).toContain('keep.txt');
    expect(output).not.toContain('secret.txt');
    stop();

    await docker.stopContainer(container.id);
    // run() starts containers that remove themselves once stopped.
    await expect
      .poll(async () => (await docker.listContainerInfos()).some((e) => e.id === container.id), {
        timeout: 10_000,
      })
      .toBe(false);
    // Removing a container that is gone already is fine.
    await docker.removeContainer(container.id, { force: false });
  });
});
