import type { Readable, Writable } from 'node:stream';

/** A bind mount, named volume or tmpfs inside a container. */
export type ContainerMount =
  | { type: 'bind'; source: string; target: string; readOnly: boolean }
  | { type: 'volume'; source: string; target: string }
  | { type: 'tmpfs'; target: string; sizeMb: number; mode: number };

/** Everything Kestrel sets on a container, independent of the Docker library. */
export interface ContainerSpec {
  image: string;
  command: string[];
  env: Record<string, string>;
  workingDir: string;
  /** "uid:gid", or null for the image default. */
  user: string | null;
  mounts: ContainerMount[];
  labels: Record<string, string>;
  /** Interactive terminal (login shell) instead of plain pipes (agent). */
  tty: boolean;
  readOnlyRootFs: boolean;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
}

/** A started container with its standard streams attached. */
export interface AttachedContainer {
  id: string;
  stdin: Writable;
  stdout: Readable;
  /** With a tty, stderr is merged into stdout and this stream stays empty. */
  stderr: Readable;
  /** Resolves with the exit code once the container ended. */
  wait(): Promise<number | null>;
  /** Stops the container (it removes itself afterwards). */
  stop(): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
}

export interface ContainerInfo {
  id: string;
  /** Without the leading "/". */
  name: string;
  image: string;
  state: string;
  /** Human text from Docker, e.g. "Up 5 minutes". */
  status: string;
  created: number;
  ports: { privatePort: number; publicPort: number | null; protocol: string; ip: string | null }[];
  labels: Record<string, string>;
  /** Host paths of bind mounts. */
  bindSources: string[];
}

export interface ImageInfo {
  id: string;
  tags: string[];
  size: number;
  created: number;
  /** Number of containers using it (-1 when Docker did not count). */
  containers: number;
}

export interface ImageBuildOptions {
  tag: string;
  buildArgs: Record<string, string>;
  labels: Record<string, string>;
  /** Dockerfile name relative to the context (default "Dockerfile"). */
  dockerfile?: string;
  /** Top-level entries of the context to send (default: only the Dockerfile). */
  src?: string[];
  signal?: AbortSignal;
}

/** Stops a running stream (events, logs). */
export type StopStream = () => void;

/** The small part of Docker that Kestrel uses (injectable for tests). */
export interface DockerApi {
  /** Throws when the daemon cannot be reached; the error code tells why. */
  ping(): Promise<void>;
  version(): Promise<string>;
  imageExists(tag: string): Promise<boolean>;
  /** Builds an image from a folder; `onLine` gets the build output. */
  buildImage(
    contextDir: string,
    options: ImageBuildOptions,
    onLine: (line: string) => void,
  ): Promise<void>;
  /** Ids of containers (also stopped ones) carrying this label. */
  listContainers(label: string): Promise<string[]>;
  /** All containers (also stopped ones) with details. */
  listContainerInfos(): Promise<ContainerInfo[]>;
  listImages(): Promise<ImageInfo[]>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string): Promise<void>;
  restartContainer(id: string): Promise<void>;
  /** Removes a container; a running one only with `force`. Gone already = fine. */
  removeContainer(id: string, options?: { force: boolean }): Promise<void>;
  removeImage(id: string): Promise<void>;
  /** Calls `onChange` for container/image events until stopped or Docker ends. */
  watchEvents(onChange: () => void, onEnd: () => void): Promise<StopStream>;
  /** Streams the last lines and then new output of a container. */
  followLogs(
    id: string,
    options: { tail: number },
    onData: (data: string) => void,
    onEnd: () => void,
  ): Promise<StopStream>;
  /** Creates, attaches and starts a container that removes itself when it ends. */
  run(spec: ContainerSpec): Promise<AttachedContainer>;
}
