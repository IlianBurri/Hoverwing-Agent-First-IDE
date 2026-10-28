import type {
  AgentConfig,
  AgentConfigView,
  AgentEvent,
  AgentOptionValue,
  AgentSlot,
  AgentStatus,
  SessionSummary,
} from '@kestrel/shared';
import { MAX_AGENT_SLOTS } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { childEnv } from '../../lib/env';
import type { PermissionService } from '../permissions';
import type { SecretStore } from '../secrets';
import type { AgentConfigStore } from './configs';
import type { AgentPrefsStore } from './prefs';
import { AgentRuntime } from './runtime';
import type { RuntimeDeps, SessionMcp } from './runtime';
import type { SessionHistory } from './sessions';
import type { AgentTransport, StartTransport } from './transport';

export interface AgentServiceDeps {
  configs: AgentConfigStore;
  secrets: SecretStore;
  sessions: SessionHistory;
  /** Session settings the user chose, applied again on the next start. */
  prefs: AgentPrefsStore;
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
    status(ownerId: number, slotId: string, status: AgentStatus): void;
    event(ownerId: number, slotId: string, sessionId: string, event: AgentEvent): void;
    log(ownerId: number, slotId: string, line: string): void;
  };
  clientVersion: string;
  /** Hoverwing's MCP tools (browser) for agents of a window. */
  mcp?: (ownerId: number) => SessionMcp;
}

const secretKey = (agentId: string, name: string) => `agent:${agentId}:${name}`;

/** Agent configurations plus up to MAX_AGENT_SLOTS parallel agents per window. */
export class AgentService {
  private readonly windows = new Map<number, Map<string, AgentRuntime>>();

  constructor(private readonly deps: AgentServiceDeps) {}

  private slots(ownerId: number): Map<string, AgentRuntime> {
    let slots = this.windows.get(ownerId);
    if (!slots) {
      slots = new Map();
      this.windows.set(ownerId, slots);
    }
    return slots;
  }

  private existing(ownerId: number, slotId: string): AgentRuntime {
    const runtime = this.windows.get(ownerId)?.get(slotId);
    if (!runtime) throw new UserError('agent_not_running', 'No agent is running.');
    return runtime;
  }

  private runtime(ownerId: number, slotId: string): AgentRuntime {
    const slots = this.slots(ownerId);
    let runtime = slots.get(slotId);
    if (!runtime) {
      if (slots.size >= MAX_AGENT_SLOTS) {
        throw new UserError('agent_limit', 'Too many agents in this window.');
      }
      runtime = new AgentRuntime({
        ownerId,
        slotId,
        startTransport: this.deps.startTransport,
        permissions: this.deps.permissions,
        checkpoint: this.deps.checkpoint,
        review: this.deps.review,
        onSessionStarted: (root, agentId, id, title) => {
          void this.deps.sessions.remember(root, { id, agentId, title, time: Date.now() });
        },
        events: {
          status: (status) => {
            this.deps.events.status(ownerId, slotId, status);
          },
          event: (sessionId, event) => {
            this.deps.events.event(ownerId, slotId, sessionId, event);
          },
          log: (line) => {
            this.deps.events.log(ownerId, slotId, line);
          },
        },
        clientVersion: this.deps.clientVersion,
        ...(this.deps.mcp ? { mcp: this.deps.mcp(ownerId) } : {}),
      });
      slots.set(slotId, runtime);
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
    slotId: string,
    root: string,
    agentId: string,
    resumeSessionId?: string,
  ): Promise<AgentStatus> {
    const config = await this.deps.configs.get(agentId);
    if (!config) throw new UserError('not_found', 'Unknown agent.');
    // Checks the limit before asking anything.
    const runtime = this.runtime(ownerId, slotId);
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
    // The container gets only the agent's own variables, not the host's.
    const status = config.sandbox.enabled
      ? await runtime.start(config, root, secrets, resumeSessionId, {
          start: () => this.deps.sandbox.startAgent(config, root, secrets),
        })
      : await runtime.start(
          config,
          root,
          { ...childEnv(process.env), ...secrets },
          resumeSessionId,
        );
    if (status.state !== 'ready') return status;
    return this.applyPrefs(runtime, root, config.id);
  }

  /** Sets the remembered choices again, as far as the agent still offers them. */
  private async applyPrefs(runtime: AgentRuntime, root: string, agentId: string) {
    const prefs = await this.deps.prefs.get(root, agentId);
    for (const [optionId, value] of Object.entries(prefs)) {
      if (!runtime.getStatus().options.some((option) => option.id === optionId)) continue;
      await runtime.setOption(optionId, value).catch(() => undefined);
    }
    return runtime.getStatus();
  }

  async setOption(
    ownerId: number,
    slotId: string,
    root: string,
    optionId: string,
    value: AgentOptionValue,
  ): Promise<AgentStatus> {
    const runtime = this.existing(ownerId, slotId);
    const status = await runtime.setOption(optionId, value);
    if (status.agentId) await this.deps.prefs.set(root, status.agentId, optionId, value);
    return status;
  }

  async prompt(ownerId: number, slotId: string, text: string): Promise<void> {
    await this.existing(ownerId, slotId).prompt(text);
  }

  async cancel(ownerId: number, slotId: string): Promise<void> {
    await this.windows.get(ownerId)?.get(slotId)?.cancel();
  }

  async stop(ownerId: number, slotId: string): Promise<void> {
    await this.windows.get(ownerId)?.get(slotId)?.stop();
  }

  /** Stops the agent of a slot and forgets the slot (tab closed). */
  async close(ownerId: number, slotId: string): Promise<void> {
    await this.stop(ownerId, slotId);
    this.windows.get(ownerId)?.delete(slotId);
  }

  /** Stops every agent of a window (e.g. another folder was opened). */
  async stopAll(ownerId: number): Promise<void> {
    await Promise.all([...(this.windows.get(ownerId)?.values() ?? [])].map((r) => r.stop()));
  }

  /** Stops all agents and forgets the window (closed or reloaded). */
  async release(ownerId: number): Promise<void> {
    await this.stopAll(ownerId);
    this.windows.delete(ownerId);
  }

  slotList(ownerId: number): AgentSlot[] {
    return [...(this.windows.get(ownerId)?.entries() ?? [])].map(([slotId, runtime]) => ({
      slotId,
      status: runtime.getStatus(),
    }));
  }

  listSessions(root: string): Promise<SessionSummary[]> {
    return this.deps.sessions.list(root);
  }
}
