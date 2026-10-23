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

/** The small part of Docker that Kestrel uses (injectable for tests). */
export interface DockerApi {
  /** Throws when the daemon cannot be reached; the error code tells why. */
  ping(): Promise<void>;
  version(): Promise<string>;
  imageExists(tag: string): Promise<boolean>;
  /** Builds an image from a folder; `onLine` gets the build output. */
  buildImage(
    contextDir: string,
    options: { tag: string; buildArgs: Record<string, string>; labels: Record<string, string> },
    onLine: (line: string) => void,
  ): Promise<void>;
  /** Ids of containers (also stopped ones) carrying this label. */
  listContainers(label: string): Promise<string[]>;
  removeContainer(id: string): Promise<void>;
  /** Creates, attaches and starts a container that removes itself when it ends. */
  run(spec: ContainerSpec): Promise<AttachedContainer>;
}
