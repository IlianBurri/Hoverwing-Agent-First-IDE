import { PassThrough } from 'node:stream';
import type { Duplex } from 'node:stream';
import { createInterface } from 'node:readline';
import Dockerode from 'dockerode';
import type { Readable } from 'node:stream';
import type {
  AttachedContainer,
  ContainerInfo,
  ContainerMount,
  ContainerSpec,
  DockerApi,
} from './api';

/** Docker answers "not modified" / "not found" when a container is already gone. */
function isGone(error: unknown): boolean {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return status === 304 || status === 404;
}

/** Awaits a Docker call, ignoring the given "nothing to do" status codes. */
async function ignoreGone(call: Promise<unknown>, codes: readonly number[]): Promise<void> {
  try {
    await call;
  } catch (error) {
    const status = (error as { statusCode?: unknown } | null)?.statusCode;
    if (typeof status !== 'number' || !codes.includes(status)) throw error;
  }
}

function toDockerMount(mount: ContainerMount): Dockerode.MountSettings {
  switch (mount.type) {
    case 'bind':
      return { Type: 'bind', Source: mount.source, Target: mount.target, ReadOnly: mount.readOnly };
    case 'volume':
      return { Type: 'volume', Source: mount.source, Target: mount.target };
    case 'tmpfs':
      return {
        Type: 'tmpfs',
        Source: '',
        Target: mount.target,
        TmpfsOptions: { SizeBytes: mount.sizeMb * 1024 * 1024, Mode: mount.mode },
      };
  }
}

export function toCreateOptions(spec: ContainerSpec): Dockerode.ContainerCreateOptions {
  const memory = spec.memoryMb * 1024 * 1024;
  return {
    Image: spec.image,
    Cmd: spec.command,
    Env: Object.entries(spec.env).map(([key, value]) => `${key}=${value}`),
    WorkingDir: spec.workingDir,
    ...(spec.user ? { User: spec.user } : {}),
    Labels: spec.labels,
    Tty: spec.tty,
    OpenStdin: true,
    StdinOnce: false,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    HostConfig: {
      AutoRemove: true,
      // A tiny init process reaps zombies and forwards signals.
      Init: true,
      ReadonlyRootfs: spec.readOnlyRootFs,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Memory: memory,
      // Same as Memory: no extra swap.
      MemorySwap: memory,
      NanoCpus: Math.round(spec.cpus * 1e9),
      PidsLimit: spec.pidsLimit,
      ...(spec.extraHosts.length > 0 ? { ExtraHosts: spec.extraHosts } : {}),
      Mounts: spec.mounts.map(toDockerMount),
    },
  };
}

/** Reads the JSON lines of a build and reports text; rejects on a build error. */
function readBuildOutput(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    let failure: string | null = null;
    const lines = createInterface({ input: stream });
    lines.on('line', (raw) => {
      if (!raw.trim()) return;
      let event: { stream?: unknown; status?: unknown; error?: unknown };
      try {
        event = JSON.parse(raw) as typeof event;
      } catch {
        onLine(raw);
        return;
      }
      if (typeof event.error === 'string') {
        failure = event.error;
        onLine(event.error);
      }
      const text = typeof event.stream === 'string' ? event.stream : event.status;
      if (typeof text === 'string') {
        for (const line of text.split('\n')) if (line.trim()) onLine(line.trimEnd());
      }
    });
    lines.once('close', () => {
      if (signal?.aborted) reject(new Error('Build cancelled.'));
      else if (failure === null) resolve();
      else reject(new Error(failure));
    });
    stream.once('error', reject);
    // A destroyed stream (cancelled build) ends without "end" for readline.
    stream.once('close', () => {
      if (signal?.aborted) reject(new Error('Build cancelled.'));
    });
  });
}

/** DockerApi on top of dockerode (talks to the daemon socket, no CLI needed). */
export function createDockerApi(options: { socketPath: string | undefined }): DockerApi {
  const docker = new Dockerode(options.socketPath ? { socketPath: options.socketPath } : undefined);

  return {
    async ping() {
      await docker.ping();
    },
    async version() {
      return (await docker.version()).Version;
    },
    async imageExists(tag) {
      try {
        await docker.getImage(tag).inspect();
        return true;
      } catch (error) {
        if (isGone(error)) return false;
        throw error;
      }
    },
    async buildImage(contextDir, options, onLine) {
      const dockerfile = options.dockerfile ?? 'Dockerfile';
      const stream = await docker.buildImage(
        { context: contextDir, src: options.src ?? [dockerfile] },
        {
          t: options.tag,
          dockerfile,
          buildargs: options.buildArgs,
          labels: options.labels,
          rm: true,
          forcerm: true,
        },
      );
      const done = readBuildOutput(stream, onLine, options.signal);
      const abort = () => {
        // Closing the connection makes Docker cancel the build.
        (stream as Readable).destroy();
      };
      if (options.signal?.aborted) abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        await done;
      } finally {
        options.signal?.removeEventListener('abort', abort);
      }
    },
    async listContainerInfos() {
      const containers = await docker.listContainers({ all: true });
      return containers.map((container): ContainerInfo => ({
        id: container.Id,
        name: (container.Names[0] ?? container.Id.slice(0, 12)).replace(/^\//, ''),
        image: container.Image,
        state: container.State,
        status: container.Status,
        created: container.Created * 1000,
        ports: container.Ports.map((port) => ({
          privatePort: port.PrivatePort,
          // Typed as always set, but Docker omits both for unpublished ports.
          publicPort: (port.PublicPort as number | undefined) ?? null,
          protocol: port.Type,
          ip: (port.IP as string | undefined) ?? null,
        })),
        labels: container.Labels,
        bindSources: container.Mounts.filter((mount) => mount.Type === 'bind').map(
          (mount) => mount.Source,
        ),
      }));
    },
    async listImages() {
      const images = await docker.listImages({ all: false });
      return images.map((image) => ({
        id: image.Id,
        tags: (image.RepoTags ?? []).filter((tag) => tag !== '<none>:<none>'),
        size: image.Size,
        created: image.Created * 1000,
        containers: image.Containers,
      }));
    },
    async startContainer(id) {
      await ignoreGone(docker.getContainer(id).start(), [304]);
    },
    async stopContainer(id) {
      await ignoreGone(docker.getContainer(id).stop({ t: 10 }), [304]);
    },
    async restartContainer(id) {
      await docker.getContainer(id).restart({ t: 10 });
    },
    async removeImage(id) {
      await docker.getImage(id).remove();
    },
    async watchEvents(onChange, onEnd) {
      const stream = (await docker.getEvents({
        filters: { type: ['container', 'image'] },
      })) as Readable;
      stream.on('data', () => {
        onChange();
      });
      let ended = false;
      const end = () => {
        if (ended) return;
        ended = true;
        onEnd();
      };
      stream.once('end', end);
      stream.once('close', end);
      stream.once('error', end);
      return () => {
        stream.destroy();
      };
    },
    async followLogs(id, { tail }, onData, onEnd) {
      const container = docker.getContainer(id);
      const tty = (await container.inspect()).Config.Tty;
      const stream = (await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        tail,
      })) as Readable;
      const output = new PassThrough();
      if (tty) stream.pipe(output);
      else docker.modem.demuxStream(stream, output, output);
      output.setEncoding('utf8');
      output.on('data', (data: string) => {
        onData(data);
      });
      let ended = false;
      const end = () => {
        if (ended) return;
        ended = true;
        onEnd();
      };
      stream.once('end', end);
      stream.once('close', end);
      stream.once('error', end);
      return () => {
        stream.destroy();
      };
    },
    async listContainers(label) {
      const containers = await docker.listContainers({ all: true, filters: { label: [label] } });
      return containers.map((container) => container.Id);
    },
    async removeContainer(id, options = { force: true }) {
      await ignoreGone(docker.getContainer(id).remove({ force: options.force }), [404]);
    },
    async bridgeGateway() {
      try {
        const network = (await docker.getNetwork('bridge').inspect()) as {
          IPAM?: { Config?: { Gateway?: string }[] };
        };
        return network.IPAM?.Config?.[0]?.Gateway ?? null;
      } catch {
        return null;
      }
    },
    async run(spec) {
      const container = await docker.createContainer(toCreateOptions(spec));
      try {
        // Attach before starting, so no early output is lost.
        const stream = (await container.attach({
          stream: true,
          stdin: true,
          stdout: true,
          stderr: true,
          hijack: true,
        })) as Duplex;
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        if (spec.tty) {
          stream.pipe(stdout);
          stream.once('end', () => stderr.end());
        } else {
          docker.modem.demuxStream(stream, stdout, stderr);
          stream.once('end', () => {
            stdout.end();
            stderr.end();
          });
        }
        // Waiting must start before the (auto-removed) container can end.
        const exit = container
          .wait({ condition: 'next-exit' })
          .then((result: { StatusCode?: number }) => result.StatusCode ?? null)
          .catch(() => null);
        await container.start();
        const attached: AttachedContainer = {
          id: container.id,
          stdin: stream,
          stdout,
          stderr,
          wait: () => exit,
          stop: async () => {
            try {
              await container.stop({ t: 2 });
            } catch (error) {
              if (!isGone(error)) throw error;
            }
          },
          resize: async (cols, rows) => {
            await container.resize({ w: cols, h: rows }).catch(() => undefined);
          },
        };
        return attached;
      } catch (error) {
        await container.remove({ force: true }).catch(() => undefined);
        throw error;
      }
    },
  };
}
