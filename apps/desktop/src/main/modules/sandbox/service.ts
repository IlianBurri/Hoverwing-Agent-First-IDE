import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentConfig, SandboxStatus } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import type { AgentTransport } from '../agent';
import type { DockerApi } from '../docker';
import { SANDBOX_DOCKERFILE, SANDBOX_LABEL, sandboxImageTag } from '../docker';
import type { PtyProcess } from '../terminal';
import { agentContainerPlan, loginContainerSpec } from './plan';
import type { SandboxIdentity } from './plan';
import { findSensitivePaths } from './scan';
import { containerPty, containerTransport } from './transport';

export interface SandboxServiceDeps {
  docker: DockerApi;
  /** Folder for the build context and the empty cover file. */
  dataDir: string;
  platform: NodeJS.Platform;
  identity: SandboxIdentity;
  hostEnv: Readonly<Record<string, string | undefined>>;
  /** Whether a Docker installation exists (to tell "not installed" apart). */
  isInstalled: () => Promise<boolean>;
  classifyError: (error: unknown, installed: boolean) => SandboxStatus['docker'];
  baseImage: () => string;
  packages: readonly string[];
  /** Label value that marks containers of this Hoverwing installation. */
  instance: string;
  onLog: (line: string) => void;
  onStatus: (status: SandboxStatus) => void;
  /** Host path of Hoverwing's MCP bridge script (mounted into agent containers). */
  mcpBridge: () => string | null;
}

export interface SandboxLaunch {
  transport: AgentTransport;
  /** The project path as the agent sees it. */
  agentRoot: string;
}

/** Runs agents (and their login shells) in Docker containers. */
export class SandboxService {
  private building: Promise<void> | null = null;
  private dockerVersion: string | null = null;

  constructor(private readonly deps: SandboxServiceDeps) {}

  private get labels(): Record<string, string> {
    return { [`${SANDBOX_LABEL}.instance`]: this.deps.instance };
  }

  private imageTag(): string {
    return sandboxImageTag(this.deps.baseImage(), this.deps.packages);
  }

  async status(): Promise<SandboxStatus> {
    const preparing = this.building !== null;
    try {
      await this.deps.docker.ping();
      this.dockerVersion ??= await this.deps.docker.version().catch(() => null);
    } catch (error) {
      const installed = await this.deps.isInstalled();
      return {
        docker: this.deps.classifyError(error, installed),
        version: null,
        imageReady: false,
        preparing,
      };
    }
    return {
      docker: 'available',
      version: this.dockerVersion,
      imageReady: await this.deps.docker.imageExists(this.imageTag()).catch(() => false),
      preparing,
    };
  }

  /** Only whether Docker can be used (cheaper than `status`). */
  async dockerState(): Promise<SandboxStatus['docker']> {
    try {
      await this.deps.docker.ping();
      return 'available';
    } catch (error) {
      return this.deps.classifyError(error, await this.deps.isInstalled());
    }
  }

  async isAvailable(): Promise<boolean> {
    return (await this.dockerState()) === 'available';
  }

  private async requireDocker(): Promise<void> {
    if (!(await this.isAvailable())) {
      throw new UserError('sandbox_unavailable', 'Docker is not available.');
    }
  }

  /** Builds the image unless it exists. Parallel calls share one build. */
  async prepare(): Promise<SandboxStatus> {
    await this.requireDocker();
    const tag = this.imageTag();
    if (!(await this.deps.docker.imageExists(tag))) {
      this.building ??= this.build(tag).finally(() => {
        this.building = null;
      });
      this.deps.onStatus(await this.status());
      try {
        await this.building;
      } catch (error) {
        this.deps.onLog(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
        this.deps.onStatus(await this.status());
        throw new UserError('sandbox_build_failed', 'The sandbox image could not be built.');
      }
    }
    const status = await this.status();
    this.deps.onStatus(status);
    return status;
  }

  private async build(tag: string): Promise<void> {
    const context = join(this.deps.dataDir, 'build');
    await mkdir(context, { recursive: true });
    await writeFile(join(context, 'Dockerfile'), SANDBOX_DOCKERFILE, 'utf8');
    this.deps.onLog(`Building ${tag} from ${this.deps.baseImage()} …`);
    await this.deps.docker.buildImage(
      context,
      {
        tag,
        buildArgs: { BASE_IMAGE: this.deps.baseImage(), PACKAGES: this.deps.packages.join(' ') },
        labels: { [SANDBOX_LABEL]: 'image' },
      },
      this.deps.onLog,
    );
    this.deps.onLog(`Built ${tag}.`);
  }

  private async emptyFile(): Promise<string> {
    const file = join(this.deps.dataDir, 'empty');
    await mkdir(this.deps.dataDir, { recursive: true });
    try {
      await access(file);
    } catch {
      await writeFile(file, '', { mode: 0o444 });
    }
    return file;
  }

  /** Starts the agent of `config` in a new container with the project mounted. */
  async startAgent(
    config: AgentConfig,
    root: string,
    env: Record<string, string>,
  ): Promise<SandboxLaunch> {
    await this.prepare();
    const hidden = await findSensitivePaths(root);
    this.deps.onLog(
      `Starting ${config.name} in ${this.imageTag()} (${String(config.sandbox.memoryMb)} MB, ${String(config.sandbox.cpus)} CPUs); covering ${String(hidden.files.length + hidden.dirs.length)} secret file(s) or folder(s).`,
    );
    const plan = agentContainerPlan({
      platform: this.deps.platform,
      root,
      agentId: config.id,
      image: this.imageTag(),
      command: config.command,
      args: config.args,
      env,
      hostEnv: this.deps.hostEnv,
      identity: this.deps.identity,
      hidden,
      emptyFile: await this.emptyFile(),
      limits: config.sandbox,
      labels: this.labels,
      mcpBridge: this.deps.mcpBridge(),
    });
    const container = await this.deps.docker.run(plan.spec);
    return { transport: containerTransport(container), agentRoot: plan.agentRoot };
  }

  /** A login shell in the agent's sandbox (no project mounted). */
  async openLogin(agentId: string): Promise<PtyProcess> {
    await this.prepare();
    const container = await this.deps.docker.run(
      loginContainerSpec({
        platform: this.deps.platform,
        agentId,
        image: this.imageTag(),
        hostEnv: this.deps.hostEnv,
        identity: this.deps.identity,
        labels: this.labels,
      }),
    );
    return containerPty(container);
  }

  /** Removes containers a previous run left behind (e.g. after a crash). */
  async removeOrphans(): Promise<void> {
    if (!(await this.isAvailable())) return;
    const ids = await this.deps.docker.listContainers(
      `${SANDBOX_LABEL}.instance=${this.deps.instance}`,
    );
    await Promise.all(ids.map((id) => this.deps.docker.removeContainer(id).catch(() => undefined)));
  }
}
