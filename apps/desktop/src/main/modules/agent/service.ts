import type {
  AgentConfig,
  AgentConfigView,
  AgentEvent,
  AgentStatus,
  SessionSummary,
} from '@kestrel/shared';
import { idleAgentStatus } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { childEnv } from '../../lib/env';
import type { PermissionService } from '../permissions';
import type { SecretStore } from '../secrets';
import type { AgentConfigStore } from './configs';
import { AgentRuntime } from './runtime';
import type { RuntimeDeps, SessionMcp } from './runtime';
import type { SessionHistory } from './sessions';
import type { AgentTransport, StartTransport } from './transport';

export interface AgentServiceDeps {
  configs: AgentConfigStore;
  secrets: SecretStore;
  sessions: SessionHistory;
  permissions: PermissionService;
  startTransport: StartTransport;
  /** Runs agents with `sandbox.enabled` in a Docker container. */
  sandbox: {
    startAgent(
      config: AgentConfig,
      root: string,
      env: Record<string, string>,
    ): Promise<{ transport: AgentTransport; agentRoot: string }>;
  };
  checkpoint: (root: string, label: string, sessionId: string) => Promise<string | null>;
  review: RuntimeDeps['review'];
  /** Asks the user (natively) whether this command line may be started. */
  confirmStart: (ownerId: number, config: AgentConfig) => Promise<boolean>;
  events: {
    status(ownerId: number, status: AgentStatus): void;
    event(ownerId: number, sessionId: string, event: AgentEvent): void;
    log(ownerId: number, line: string): void;
  };
  clientVersion: string;
  /** Kestrel's MCP tools (browser) for agents of a window. */
  mcp?: (ownerId: number) => SessionMcp;
}

const secretKey = (agentId: string, name: string) => `agent:${agentId}:${name}`;

/** Agent configurations plus one running agent per window. */
export class AgentService {
  private readonly runtimes = new Map<number, AgentRuntime>();

  constructor(private readonly deps: AgentServiceDeps) {}

  private runtime(ownerId: number): AgentRuntime {
    let runtime = this.runtimes.get(ownerId);
    if (!runtime) {
      runtime = new AgentRuntime({
        ownerId,
        startTransport: this.deps.startTransport,
        permissions: this.deps.permissions,
        checkpoint: this.deps.checkpoint,
        review: this.deps.review,
        onSessionStarted: (root, agentId, id, title) => {
          void this.deps.sessions.remember(root, { id, agentId, title, time: Date.now() });
        },
        events: {
          status: (status) => {
            this.deps.events.status(ownerId, status);
          },
          event: (sessionId, event) => {
            this.deps.events.event(ownerId, sessionId, event);
          },
          log: (line) => {
            this.deps.events.log(ownerId, line);
          },
        },
        clientVersion: this.deps.clientVersion,
        ...(this.deps.mcp ? { mcp: this.deps.mcp(ownerId) } : {}),
      });
      this.runtimes.set(ownerId, runtime);
    }
    return runtime;
  }

  async listConfigs(): Promise<AgentConfigView[]> {
    const configs = await this.deps.configs.list();
    return Promise.all(configs.map((config) => this.view(config)));
  }

  private async view(config: AgentConfig): Promise<AgentConfigView> {
    const envSet: Record<string, boolean> = {};
    for (const name of config.env)
      envSet[name] = await this.deps.secrets.has(secretKey(config.id, name));
    return { ...config, envSet };
  }

  async saveConfig(config: AgentConfig): Promise<AgentConfigView> {
    return this.view(await this.deps.configs.save(config));
  }

  async deleteConfig(id: string): Promise<void> {
    const config = await this.deps.configs.get(id);
    for (const name of config?.env ?? []) await this.deps.secrets.set(secretKey(id, name), null);
    await this.deps.configs.delete(id);
  }

  async setEnv(agentId: string, name: string, value: string | null): Promise<void> {
    const config = await this.deps.configs.get(agentId);
    if (!config?.env.includes(name)) throw new UserError('not_found', 'Unknown variable.');
    await this.deps.secrets.set(secretKey(agentId, name), value);
  }

  async start(
    ownerId: number,
    root: string,
    agentId: string,
    resumeSessionId?: string,
  ): Promise<AgentStatus> {
    const config = await this.deps.configs.get(agentId);
    if (!config) throw new UserError('not_found', 'Unknown agent.');
    if (!(await this.deps.configs.isApproved(config))) {
      if (!(await this.deps.confirmStart(ownerId, config))) {
        throw new UserError('agent_not_approved', 'The user did not allow this agent.');
      }
      await this.deps.configs.approve(config);
    }
    const secrets: Record<string, string> = {};
    for (const name of config.env) {
      const value = await this.deps.secrets.get(secretKey(config.id, name));
      if (value !== null) secrets[name] = value;
    }
    if (config.sandbox.enabled) {
      // The container gets only the agent's own variables, not the host's.
      return this.runtime(ownerId).start(config, root, secrets, resumeSessionId, {
        start: () => this.deps.sandbox.startAgent(config, root, secrets),
      });
    }
    const env = { ...childEnv(process.env), ...secrets };
    return this.runtime(ownerId).start(config, root, env, resumeSessionId);
  }

  prompt(ownerId: number, text: string): Promise<void> {
    return this.runtime(ownerId).prompt(text);
  }

  cancel(ownerId: number): Promise<void> {
    return this.runtime(ownerId).cancel();
  }

  async stop(ownerId: number): Promise<void> {
    await this.runtimes.get(ownerId)?.stop();
  }

  /** Stops the agent and forgets the window (closed or reloaded). */
  async release(ownerId: number): Promise<void> {
    await this.stop(ownerId);
    this.runtimes.delete(ownerId);
  }

  status(ownerId: number): AgentStatus {
    return this.runtimes.get(ownerId)?.getStatus() ?? idleAgentStatus;
  }

  listSessions(root: string): Promise<SessionSummary[]> {
    return this.deps.sessions.list(root);
  }
}
