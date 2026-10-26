import type { AgentSandbox } from '@kestrel/shared';
import type { ContainerMount, ContainerSpec } from '../docker';
import { SANDBOX_LABEL } from '../docker';

/** Home of the agent inside the container: a Docker volume per agent. */
export const SANDBOX_HOME = '/home/kestrel';
const NPM_CACHE = '/cache/npm';
/** Where the project is mounted on Windows (other systems keep the host path). */
const WINDOWS_WORKSPACE = '/workspace';
const PIDS_LIMIT = 1024;
/** Where Kestrel's MCP bridge script is mounted (read-only) in agent containers. */
export const CONTAINER_MCP_BRIDGE = '/opt/kestrel/kestrel-mcp-bridge.mjs';
/** Lets containers reach Kestrel's MCP endpoint on the host (Linux needs it explicitly). */
const HOST_GATEWAY = 'host.docker.internal:host-gateway';

/** Proxy settings are passed on, so agents work behind corporate proxies. */
const PASSED_VARIABLES = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
];

export interface SandboxIdentity {
  /** Host user, so files the agent creates belong to the user (Linux). */
  uid: number | null;
  gid: number | null;
}

export interface HiddenPaths {
  /** Secret files (relative to the project), covered by an empty file. */
  files: readonly string[];
  /** Secret folders (relative to the project), covered by an empty tmpfs. */
  dirs: readonly string[];
}

export interface AgentContainerInput {
  platform: NodeJS.Platform;
  /** Absolute project path on the host. */
  root: string;
  agentId: string;
  image: string;
  command: string;
  args: readonly string[];
  /** Variables of the agent config (secret values) to set in the container. */
  env: Readonly<Record<string, string>>;
  /** Host environment, only proxy variables are taken from it. */
  hostEnv: Readonly<Record<string, string | undefined>>;
  identity: SandboxIdentity;
  hidden: HiddenPaths;
  /** An empty, read-only host file used to cover secret files. */
  emptyFile: string;
  limits: Pick<AgentSandbox, 'memoryMb' | 'cpus'>;
  /** Labels that identify this Kestrel installation (orphan cleanup). */
  labels: Readonly<Record<string, string>>;
  /** Host path of the MCP bridge script, mounted read-only (null: none). */
  mcpBridge: string | null;
}

export interface AgentContainerPlan {
  spec: ContainerSpec;
  /** The project path as the agent sees it. */
  agentRoot: string;
}

/** Project path inside the container: same path, except on Windows. */
export function containerRoot(platform: NodeJS.Platform, root: string): string {
  return platform === 'win32' ? WINDOWS_WORKSPACE : root;
}

export function homeVolume(agentId: string): string {
  return `kestrel-home-${agentId}`;
}

function containerUser(platform: NodeJS.Platform, identity: SandboxIdentity): string {
  // Docker Desktop (macOS, Windows) maps file owners itself; 1000 is the
  // "node" user of the Node images.
  if (platform === 'linux' && identity.uid !== null && identity.gid !== null) {
    return `${String(identity.uid)}:${String(identity.gid)}`;
  }
  return '1000:1000';
}

function baseEnv(hostEnv: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const env: Record<string, string> = {
    HOME: SANDBOX_HOME,
    npm_config_cache: NPM_CACHE,
    LANG: 'C.UTF-8',
    KESTREL_SANDBOX: '1',
  };
  for (const name of PASSED_VARIABLES) {
    const value = hostEnv[name];
    if (value) env[name] = value;
  }
  return env;
}

function sharedMounts(agentId: string): ContainerMount[] {
  return [
    { type: 'volume', source: homeVolume(agentId), target: SANDBOX_HOME },
    { type: 'volume', source: 'kestrel-npm-cache', target: NPM_CACHE },
    { type: 'tmpfs', target: '/tmp', sizeMb: 1024, mode: 0o1777 },
  ];
}

/**
 * The container an agent runs in. It sees the project (read-write) and its
 * own home volume, nothing else of the host. Secret files of the project are
 * covered, the root file system is read-only, all capabilities are dropped.
 */
export function agentContainerPlan(input: AgentContainerInput): AgentContainerPlan {
  const agentRoot = containerRoot(input.platform, input.root);
  const inProject = (path: string) => `${agentRoot}/${path}`;
  const mounts: ContainerMount[] = [
    { type: 'bind', source: input.root, target: agentRoot, readOnly: false },
    ...sharedMounts(input.agentId),
    ...input.hidden.files.map((path): ContainerMount => ({
      type: 'bind',
      source: input.emptyFile,
      target: inProject(path),
      readOnly: true,
    })),
    ...input.hidden.dirs.map((path): ContainerMount => ({
      type: 'tmpfs',
      target: inProject(path),
      sizeMb: 1,
      mode: 0o700,
    })),
    ...(input.mcpBridge
      ? [
          {
            type: 'bind',
            source: input.mcpBridge,
            target: CONTAINER_MCP_BRIDGE,
            readOnly: true,
          } satisfies ContainerMount,
        ]
      : []),
  ];
  return {
    agentRoot,
    spec: {
      image: input.image,
      command: [input.command, ...input.args],
      env: { ...baseEnv(input.hostEnv), ...input.env },
      workingDir: agentRoot,
      user: containerUser(input.platform, input.identity),
      mounts,
      labels: {
        ...input.labels,
        [SANDBOX_LABEL]: 'agent',
        [`${SANDBOX_LABEL}.agent`]: input.agentId,
      },
      tty: false,
      readOnlyRootFs: true,
      memoryMb: input.limits.memoryMb,
      cpus: input.limits.cpus,
      pidsLimit: PIDS_LIMIT,
      extraHosts: [HOST_GATEWAY],
    },
  };
}

/**
 * A login shell in the agent's sandbox, without the project: the user signs
 * in to the agent there, and the login stays in the agent's home volume.
 */
export function loginContainerSpec(input: {
  platform: NodeJS.Platform;
  agentId: string;
  image: string;
  hostEnv: Readonly<Record<string, string | undefined>>;
  identity: SandboxIdentity;
  labels: Readonly<Record<string, string>>;
}): ContainerSpec {
  return {
    image: input.image,
    command: ['bash', '-l'],
    env: { ...baseEnv(input.hostEnv), TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    workingDir: SANDBOX_HOME,
    user: containerUser(input.platform, input.identity),
    mounts: sharedMounts(input.agentId),
    labels: {
      ...input.labels,
      [SANDBOX_LABEL]: 'login',
      [`${SANDBOX_LABEL}.agent`]: input.agentId,
    },
    tty: true,
    readOnlyRootFs: true,
    memoryMb: 2048,
    cpus: 1,
    pidsLimit: PIDS_LIMIT,
    extraHosts: [],
  };
}
