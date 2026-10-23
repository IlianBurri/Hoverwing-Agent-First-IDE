import { PassThrough } from 'node:stream';
import type { Duplex } from 'node:stream';
import { createInterface } from 'node:readline';
import Dockerode from 'dockerode';
import type { AttachedContainer, ContainerMount, ContainerSpec, DockerApi } from './api';

/** Docker answers "not modified" / "not found" when a container is already gone. */
function isGone(error: unknown): boolean {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return status === 304 || status === 404;
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
      Mounts: spec.mounts.map(toDockerMount),
    },
  };
}

/** Reads the JSON lines of a build and reports text; rejects on a build error. */
function readBuildOutput(stream: NodeJS.ReadableStream, onLine: (line: string) => void) {
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
      if (failure === null) resolve();
      else reject(new Error(failure));
    });
    stream.once('error', reject);
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
    async buildImage(contextDir, { tag, buildArgs, labels }, onLine) {
      const stream = await docker.buildImage(
        { context: contextDir, src: ['Dockerfile'] },
        { t: tag, buildargs: buildArgs, labels, rm: true, forcerm: true },
      );
      await readBuildOutput(stream, onLine);
    },
    async listContainers(label) {
      const containers = await docker.listContainers({ all: true, filters: { label: [label] } });
      return containers.map((container) => container.Id);
    },
    async removeContainer(id) {
      try {
        await docker.getContainer(id).remove({ force: true });
      } catch (error) {
        if (!isGone(error)) throw error;
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
