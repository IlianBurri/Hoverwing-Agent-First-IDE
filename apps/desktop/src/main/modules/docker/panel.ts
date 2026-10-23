import { readdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import type {
  ContainerState,
  ContainerSummary,
  DockerOverview,
  DockerState,
  ImageSummary,
} from '@kestrel/shared';
import { containerStateSchema } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { redact } from '../../lib/redact';
import { isHeavyDirectory, resolveInWorkspace } from '../workspace';
import type { ContainerInfo, DockerApi, ImageInfo, StopStream } from './api';
import { SANDBOX_LABEL } from './image';

const COMPOSE_PROJECT = 'com.docker.compose.project';
const COMPOSE_DIR = 'com.docker.compose.project.working_dir';
const LOG_TAIL = 500;
const MAX_DOCKERFILES = 50;
const DOCKERFILE_DEPTH = 4;
const CHANGE_DELAY_MS = 250;

export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** "Dockerfile", "Dockerfile.dev" or "api.Dockerfile". */
export function isDockerfileName(name: string): boolean {
  return /^Dockerfile(\.[\w.-]+)?$/.test(name) || /^[\w.-]+\.Dockerfile$/.test(name);
}

function containerState(state: string): ContainerState {
  const parsed = containerStateSchema.safeParse(state);
  return parsed.success ? parsed.data : 'unknown';
}

/** What the UI sees of a container; `root` marks containers of the open project. */
export function summarizeContainer(info: ContainerInfo, root: string | null): ContainerSummary {
  const composeDir = info.labels[COMPOSE_DIR];
  const inProject =
    root !== null &&
    ((composeDir !== undefined && isInside(root, composeDir)) ||
      info.bindSources.some((source) => isInside(root, source)));
  return {
    id: info.id,
    name: info.name,
    image: info.image,
    state: containerState(info.state),
    status: info.status,
    created: info.created,
    // Docker lists a port once per address family; show each mapping once.
    ports: info.ports.filter(
      (port, index, all) =>
        all.findIndex(
          (other) =>
            other.privatePort === port.privatePort &&
            other.publicPort === port.publicPort &&
            other.protocol === port.protocol,
        ) === index,
    ),
    sandbox: info.labels[SANDBOX_LABEL] !== undefined,
    composeProject: info.labels[COMPOSE_PROJECT] ?? null,
    inProject,
  };
}

export function summarizeImage(info: ImageInfo): ImageSummary {
  return { ...info, tags: [...info.tags].sort() };
}

/** Turns a Docker error into something the user can act on (details go to the log). */
export function dockerError(error: unknown): UserError {
  if (error instanceof UserError) return error;
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  if (status === 409) return new UserError('docker_conflict', 'Docker refused: still in use.');
  if (status === 404) return new UserError('not_found', 'Not found in Docker.');
  return new UserError('docker_failed', 'The Docker action failed.');
}

function errorText(error: unknown): string {
  const json = (error as { json?: { message?: unknown } } | null)?.json;
  if (json && typeof json.message === 'string') return json.message;
  return error instanceof Error ? error.message : String(error);
}

export interface DockerPanelDeps {
  docker: DockerApi;
  state: () => Promise<DockerState>;
  /** Containers or images changed (debounced). */
  onChanged: () => void;
  onOutput: (ownerId: number, streamId: string, data: string) => void;
  onStreamEnded: (ownerId: number, streamId: string, ok: boolean) => void;
  /** Details of failed actions, for Logs › Docker. */
  onLog: (line: string) => void;
}

interface OpenStream {
  ownerId: number;
  stop: StopStream;
}

/** Lists and controls containers and images for the Docker panel. */
export class DockerPanelService {
  private watching = false;
  private changeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly streams = new Map<string, OpenStream>();
  private nextStream = 1;

  constructor(private readonly deps: DockerPanelDeps) {}

  async overview(root: string | null): Promise<DockerOverview> {
    const docker = await this.deps.state();
    if (docker !== 'available') return { docker, containers: [], images: [] };
    void this.watch();
    const [containers, images] = await Promise.all([
      this.deps.docker.listContainerInfos(),
      this.deps.docker.listImages(),
    ]);
    return {
      docker,
      containers: containers
        .map((info) => summarizeContainer(info, root))
        .sort((a, b) => a.name.localeCompare(b.name)),
      images: images.map(summarizeImage).sort((a, b) => b.created - a.created),
    };
  }

  /** Follows Docker's event stream while it is reachable. */
  private async watch(): Promise<void> {
    if (this.watching) return;
    this.watching = true;
    try {
      await this.deps.docker.watchEvents(
        () => {
          this.changed();
        },
        () => {
          this.watching = false;
          // Docker went away (or came back): let the UI check again.
          this.changed();
        },
      );
    } catch {
      this.watching = false;
    }
  }

  private changed(): void {
    if (this.changeTimer) return;
    this.changeTimer = setTimeout(() => {
      this.changeTimer = null;
      this.deps.onChanged();
    }, CHANGE_DELAY_MS);
  }

  private async act(what: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.deps.onLog(`${what} failed: ${redact(errorText(error))}`);
      throw dockerError(error);
    }
  }

  start(id: string): Promise<void> {
    return this.act('Start', () => this.deps.docker.startContainer(id));
  }

  stop(id: string): Promise<void> {
    return this.act('Stop', () => this.deps.docker.stopContainer(id));
  }

  restart(id: string): Promise<void> {
    return this.act('Restart', () => this.deps.docker.restartContainer(id));
  }

  removeContainer(id: string, force: boolean): Promise<void> {
    return this.act('Remove container', () => this.deps.docker.removeContainer(id, { force }));
  }

  removeImage(id: string): Promise<void> {
    return this.act('Remove image', () => this.deps.docker.removeImage(id));
  }

  /** Dockerfiles in the project (heavy folders and .git skipped). */
  async findDockerfiles(root: string): Promise<string[]> {
    const found: string[] = [];
    const pending: { dir: string; depth: number }[] = [{ dir: '', depth: 0 }];
    while (pending.length > 0 && found.length < MAX_DOCKERFILES) {
      const { dir, depth } = pending.shift() ?? { dir: '', depth: 0 };
      let entries;
      try {
        entries = await readdir(join(root, dir), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const path = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isFile() && isDockerfileName(entry.name)) found.push(path);
        else if (
          entry.isDirectory() &&
          depth < DOCKERFILE_DEPTH &&
          entry.name !== '.git' &&
          !isHeavyDirectory(entry.name)
        ) {
          pending.push({ dir: path, depth: depth + 1 });
        }
      }
    }
    return found.sort();
  }

  private openStream(ownerId: number, prefix: 'b' | 'l', stop: StopStream): string {
    const streamId = `${prefix}${String(this.nextStream++)}`;
    this.streams.set(streamId, { ownerId, stop });
    return streamId;
  }

  private endStream(streamId: string, ok: boolean): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    this.streams.delete(streamId);
    this.deps.onStreamEnded(stream.ownerId, streamId, ok);
  }

  /** Builds `dockerfile` (relative to the project) with its folder as context. */
  async build(ownerId: number, root: string, dockerfile: string, tag: string): Promise<string> {
    if ((await this.deps.state()) !== 'available') {
      throw new UserError('sandbox_unavailable', 'Docker is not available.');
    }
    const absolute = await resolveInWorkspace(root, dockerfile);
    if (!isDockerfileName(basename(absolute))) {
      throw new UserError('permission_denied', 'Only Dockerfiles can be built.');
    }
    const context = dirname(absolute);
    const src = await readdir(context);
    const controller = new AbortController();
    const streamId = this.openStream(ownerId, 'b', () => {
      controller.abort();
    });
    const output = (line: string) => {
      this.deps.onOutput(ownerId, streamId, `${line}\r\n`);
    };
    output(`Building ${tag} from ${dockerfile} …`);
    void this.deps.docker
      .buildImage(
        context,
        {
          tag,
          dockerfile: basename(absolute),
          src,
          buildArgs: {},
          labels: { 'dev.kestrel.build': '1' },
          signal: controller.signal,
        },
        output,
      )
      .then(
        () => {
          output(`Built ${tag}.`);
          this.endStream(streamId, true);
        },
        (error: unknown) => {
          output(`Build failed: ${redact(errorText(error))}`);
          this.endStream(streamId, false);
        },
      );
    return streamId;
  }

  async openLogs(ownerId: number, id: string): Promise<string> {
    // Registered first, so output arriving right away has its stream id.
    const stream: OpenStream = { ownerId, stop: () => undefined };
    const streamId = this.openStream(ownerId, 'l', () => {
      stream.stop();
    });
    try {
      stream.stop = await this.deps.docker.followLogs(
        id,
        { tail: LOG_TAIL },
        (data) => {
          this.deps.onOutput(ownerId, streamId, data.replace(/\r?\n/g, '\r\n'));
        },
        () => {
          this.endStream(streamId, true);
        },
      );
      // Closed while connecting: stop right away.
      if (!this.streams.has(streamId)) stream.stop();
      return streamId;
    } catch (error) {
      this.streams.delete(streamId);
      this.deps.onLog(`Logs failed: ${redact(errorText(error))}`);
      throw dockerError(error);
    }
  }

  closeStream(ownerId: number, streamId: string): void {
    const stream = this.streams.get(streamId);
    if (stream?.ownerId !== ownerId) return;
    stream.stop();
    this.streams.delete(streamId);
  }

  /** The window closed or reloaded: stop its log streams and builds. */
  release(ownerId: number): void {
    for (const [streamId, stream] of this.streams) {
      if (stream.ownerId === ownerId) {
        stream.stop();
        this.streams.delete(streamId);
      }
    }
  }
}
