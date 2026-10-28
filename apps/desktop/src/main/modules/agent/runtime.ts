import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { PROTOCOL_VERSION, RequestError, client } from '@agentclientprotocol/sdk';
import type {
  ClientConnection,
  ClientContext,
  McpServer,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';
import { idleAgentStatus } from '@kestrel/shared';
import type {
  AgentConfig,
  AgentEvent,
  AgentStatus,
  PermissionKind,
  ToolCallView,
} from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { redact } from '../../lib/redact';
import type { PermissionService } from '../permissions';
import type { ChangeAuthor } from '../review';
import { resolveInWorkspace } from '../workspace/paths';
import { actionForToolCall, outcomeFor } from './permissionMapping';
import { displayPath, mergeToolCall, translateUpdate, unifiedDiff } from './translate';
import type { AgentTransport, IsolatedStart, SpawnOptions } from './transport';

/** Starting can include an `npx` download, so be patient. */
const INIT_TIMEOUT_MS = 180_000;
/** After "stop", the agent gets this long before its process is killed. */
const CANCEL_GRACE_MS = 3000;
const STDERR_TAIL = 20;

export interface RuntimeEvents {
  status(status: AgentStatus): void;
  event(sessionId: string, event: AgentEvent): void;
  log(line: string): void;
}

/** Kestrel's own MCP servers for one agent session (browser tools). */
export type SessionMcp = (options: {
  sandboxed: boolean;
  /** The agent can connect to MCP servers over HTTP. */
  http: boolean;
  /** Permission check in the context of this session. */
  check: (kind: PermissionKind, target: string, title: string) => Promise<boolean>;
}) => Promise<{ servers: McpServer[]; release: () => void }>;

export interface RuntimeDeps {
  ownerId: number;
  /** The agent tab this runtime belongs to (unique within the window). */
  slotId: string;
  startTransport: (options: SpawnOptions) => Promise<AgentTransport>;
  permissions: PermissionService;
  /** Creates a checkpoint before each turn; returns its id (or null). */
  checkpoint: (root: string, label: string, sessionId: string) => Promise<string | null>;
  /** Diff review: held writes and changes the agent applied itself. */
  review: {
    hold(root: string, path: string, content: string, author: ChangeAuthor): Promise<void>;
    heldContent(root: string, path: string, agentKey: string): string | undefined;
    collectApplied(root: string, checkpointId: string, author: ChangeAuthor): Promise<void>;
    /** Another agent whose held change locks the file, or null. */
    lockedBy(root: string, path: string, agentKey: string): string | null;
  };
  /** Called when a session starts, e.g. to remember it for "resume". */
  onSessionStarted: (root: string, agentId: string, sessionId: string, title: string) => void;
  events: RuntimeEvents;
  clientVersion: string;
  /** Optional: Kestrel's MCP tools for the agent (e.g. the browser). */
  mcp?: SessionMcp;
}

/**
 * One running agent (one slot of a window): owns the process, the ACP connection
 * and the active session. All agent requests (permissions, file access) go
 * through Kestrel's permission service.
 */
export class AgentRuntime {
  private status: AgentStatus = idleAgentStatus;
  private transport: AgentTransport | null = null;
  private connection: ClientConnection | null = null;
  private config: AgentConfig | null = null;
  private root = '';
  /** The project path as the agent sees it (differs in the sandbox on Windows). */
  private agentRoot = '';
  private readonly toolCalls = new Map<string, ToolCallView>();
  private readonly stderrTail: string[] = [];
  private cancelTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTitle = '';
  private releaseMcp: (() => void) | null = null;

  constructor(private readonly deps: RuntimeDeps) {}

  getStatus(): AgentStatus {
    return this.status;
  }

  private setStatus(patch: Partial<AgentStatus>): AgentStatus {
    this.status = { ...this.status, ...patch };
    this.deps.events.status(this.status);
    return this.status;
  }

  private emit(event: AgentEvent): void {
    if (this.status.sessionId) this.deps.events.event(this.status.sessionId, event);
  }

  private get agent(): ClientContext {
    if (!this.connection) throw new UserError('agent_not_running', 'No agent is running.');
    return this.connection.agent;
  }

  private permissionContext(sessionId: string) {
    return {
      ownerId: this.deps.ownerId,
      root: this.root,
      agentName: this.config?.name ?? 'Agent',
      sessionId,
      slotId: this.deps.slotId,
    };
  }

  /** Kestrel's MCP servers for this session (none if unavailable). */
  private async sessionMcpServers(
    http: boolean,
    sandboxed: boolean,
    sessionId: () => string | null,
  ): Promise<McpServer[]> {
    if (!this.deps.mcp) return [];
    try {
      const mcp = await this.deps.mcp({
        sandboxed,
        http,
        check: (kind, target, title) =>
          this.deps.permissions.check(this.permissionContext(sessionId() ?? ''), {
            kind,
            target,
            title,
          }),
      });
      this.releaseMcp = mcp.release;
      return mcp.servers;
    } catch (error) {
      this.deps.events.log(redact(`Kestrel tools unavailable: ${String(error)}`));
      return [];
    }
  }

  /** Builds the ACP client: these handlers answer the agent's requests. */
  private clientApp(sessionCheck: () => string | null) {
    const context = () => this.permissionContext(sessionCheck() ?? '');

    return client({ name: 'Kestrel' })
      .onNotification('session/update', ({ params }) => {
        if (params.sessionId !== sessionCheck()) return;
        const event = translateUpdate(this.agentRoot, params.update, this.toolCalls);
        if (event) this.emit(event);
      })
      .onRequest('session/request_permission', async ({ params }) => {
        if (params.sessionId !== sessionCheck()) return { outcome: { outcome: 'cancelled' } };
        const view = this.rememberToolCall(params.toolCall);
        const allowed = await this.deps.permissions.check(
          context(),
          actionForToolCall(view, params.toolCall.rawInput),
        );
        return { outcome: outcomeFor(allowed, params.options) };
      })
      .onRequest('fs/read_text_file', async ({ params }) => {
        const relativePath = this.projectPath(params.path);
        const allowed = await this.deps.permissions.check(context(), {
          kind: 'file.read',
          target: relativePath,
          title: relativePath,
        });
        if (!allowed) throw denied();
        // The agent sees its own held (not yet accepted) version of the file.
        const content =
          this.deps.review.heldContent(this.root, relativePath, this.author().key) ??
          (await readFile(await resolveInWorkspace(this.root, relativePath), 'utf8'));
        return { content: sliceLines(content, params.line ?? null, params.limit ?? null) };
      })
      .onRequest('fs/write_text_file', async ({ params }) => {
        const relativePath = this.projectPath(params.path);
        const absolute = await resolveInWorkspace(this.root, relativePath);
        const author = this.author();
        const owner = this.deps.review.lockedBy(this.root, relativePath, author.key);
        if (owner !== null) throw lockedByAgent(owner);
        if (this.config?.reviewChanges) {
          // Held back for the diff review: nothing reaches the disk yet, so
          // only rules (and the secret guard) apply, without asking.
          const action = { kind: 'file.write' as const, target: relativePath, title: relativePath };
          if (await this.deps.permissions.denies(context(), action)) throw denied();
          await this.deps.review.hold(this.root, relativePath, params.content, author);
          return {};
        }
        const previous = await readFile(absolute, 'utf8').catch(() => null);
        const allowed = await this.deps.permissions.check(context(), {
          kind: 'file.write',
          target: relativePath,
          title: relativePath,
          diff: unifiedDiff(relativePath, previous, params.content),
        });
        if (!allowed) throw denied();
        await writeFile(absolute, params.content, 'utf8');
        return {};
      });
  }

  /** Session ids of different agents may collide, so changes are keyed by tab. */
  private author(): ChangeAuthor {
    return {
      key: `${String(this.deps.ownerId)}:${this.deps.slotId}`,
      agentName: this.config?.name ?? 'Agent',
    };
  }

  /** Denies the open permission questions of this agent only (not of parallel ones). */
  private cancelPermissions(): void {
    this.deps.permissions.cancel(this.deps.ownerId, this.deps.slotId);
  }

  private rememberToolCall(update: ToolCallUpdate): ToolCallView {
    const view = mergeToolCall(this.agentRoot, this.toolCalls.get(update.toolCallId), update);
    this.toolCalls.set(view.id, view);
    return view;
  }

  /** Agent paths are absolute; only paths inside the project are allowed. */
  private projectPath(path: string): string {
    const relativePath = displayPath(this.agentRoot, path);
    if (isAbsolute(relativePath)) {
      throw RequestError.invalidParams(undefined, 'Only files inside the project are allowed.');
    }
    return relativePath;
  }

  async start(
    config: AgentConfig,
    root: string,
    env: Record<string, string>,
    resumeSessionId?: string,
    isolated?: IsolatedStart,
  ): Promise<AgentStatus> {
    await this.stop();
    this.config = config;
    this.root = root;
    this.agentRoot = root;
    this.toolCalls.clear();
    this.stderrTail.length = 0;
    this.setStatus({
      ...idleAgentStatus,
      state: 'starting',
      agentId: config.id,
      agentName: config.name,
      sandboxed: isolated !== undefined,
    });

    let transport: AgentTransport;
    try {
      if (isolated) {
        const launch = await isolated.start();
        transport = launch.transport;
        this.agentRoot = launch.agentRoot;
      } else {
        transport = await this.deps.startTransport({
          command: config.command,
          args: config.args,
          cwd: root,
          env,
        });
      }
    } catch (error) {
      return this.setStatus({
        state: 'error',
        error: isolated ? 'sandboxFailed' : 'spawnFailed',
        detail: redact(String(error)),
      });
    }
    this.transport = transport;
    transport.onStderr((line) => {
      const safe = redact(line);
      this.stderrTail.push(safe);
      if (this.stderrTail.length > STDERR_TAIL) this.stderrTail.shift();
      this.deps.events.log(safe);
    });
    transport.onExit((code) => {
      if (this.transport !== transport) return;
      this.releaseMcp?.();
      this.releaseMcp = null;
      this.transport = null;
      this.connection = null;
      this.cancelPermissions();
      if (this.status.state === 'stopped') return;
      this.setStatus({
        state: 'error',
        error: 'crashed',
        detail: `${this.stderrTail.slice(-5).join('\n')}\n(exit code ${String(code)})`.trim(),
      });
    });

    let sessionId: string | null = null;
    this.connection = this.clientApp(() => sessionId).connect(transport.stream);
    try {
      const init = await withTimeout(
        this.agent.request('initialize', {
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
          clientInfo: { name: 'kestrel', title: 'Kestrel', version: this.deps.clientVersion },
        }),
        INIT_TIMEOUT_MS,
        'The agent did not answer in time.',
      );
      const canLoadSession = init.agentCapabilities?.loadSession === true;
      const mcpServers = await this.sessionMcpServers(
        init.agentCapabilities?.mcpCapabilities?.http === true,
        isolated !== undefined,
        () => sessionId,
      );
      if (resumeSessionId && canLoadSession) {
        // Set first: the agent replays the history as session updates.
        sessionId = resumeSessionId;
        // Announce the session first, so the UI starts a fresh transcript
        // before the agent replays the history into it.
        this.setStatus({ sessionId });
        await this.agent.request('session/load', {
          sessionId: resumeSessionId,
          cwd: this.agentRoot,
          mcpServers,
        });
      } else {
        const session = await this.agent.request('session/new', {
          cwd: this.agentRoot,
          mcpServers,
        });
        sessionId = session.sessionId;
      }
      this.deps.onSessionStarted(root, config.id, sessionId, '');
      return this.setStatus({ state: 'ready', sessionId, canLoadSession });
    } catch (error) {
      const authRequired = error instanceof RequestError && error.code === -32000;
      const detail = authRequired ? null : redact(errorText(error, this.stderrTail));
      const status = this.setStatus({
        state: 'error',
        error: authRequired ? 'authRequired' : 'initFailed',
        detail,
      });
      this.disconnect();
      return status;
    }
  }

  async prompt(text: string): Promise<void> {
    const sessionId = this.status.sessionId;
    if (this.status.state !== 'ready' || !sessionId) {
      throw new UserError('agent_not_running', 'The agent is not ready.');
    }
    this.setStatus({ state: 'working' });
    this.emit({ type: 'message', role: 'user', text });
    if (!this.turnTitle) {
      this.turnTitle = text.slice(0, 80);
      if (this.config)
        this.deps.onSessionStarted(this.root, this.config.id, sessionId, this.turnTitle);
    }
    const agentName = this.config?.name ?? 'Agent';
    const checkpointId = await this.deps
      .checkpoint(this.root, `${agentName}: ${text.replace(/\s+/g, ' ')}`.slice(0, 80), sessionId)
      .catch(() => null);
    this.emit({ type: 'turnStarted', checkpointId });

    // Runs in the background; the UI follows via events.
    const root = this.root;
    const review = this.config?.reviewChanges === true;
    void this.agent
      .request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] })
      .then(
        async (response) => {
          // Changes the agent wrote itself become reviewable too.
          if (review && checkpointId)
            await this.deps.review
              .collectApplied(root, checkpointId, this.author())
              .catch(() => undefined);
          this.emit({ type: 'turnEnded', stopReason: response.stopReason });
        },
        (error: unknown) => {
          this.emit({ type: 'notice', text: redact(errorText(error, [])) });
          this.emit({ type: 'turnEnded', stopReason: 'error' });
        },
      )
      .finally(() => {
        if (this.cancelTimer) clearTimeout(this.cancelTimer);
        this.cancelTimer = null;
        if (this.status.state === 'working') this.setStatus({ state: 'ready' });
      });
  }

  /** Stops the current turn; a stuck agent is killed after a grace period. */
  async cancel(): Promise<void> {
    const sessionId = this.status.sessionId;
    if (this.status.state !== 'working' || !sessionId) return;
    this.cancelPermissions();
    await this.agent.notify('session/cancel', { sessionId }).catch(() => undefined);
    this.cancelTimer ??= setTimeout(() => {
      if (this.status.state !== 'working') return;
      this.emit({ type: 'notice', text: 'The agent did not stop in time and was ended.' });
      this.emit({ type: 'turnEnded', stopReason: 'cancelled' });
      void this.stop();
    }, CANCEL_GRACE_MS);
  }

  private disconnect(): void {
    this.releaseMcp?.();
    this.releaseMcp = null;
    const transport = this.transport;
    this.transport = null;
    this.connection?.close();
    this.connection = null;
    transport?.kill();
  }

  async stop(): Promise<void> {
    if (this.cancelTimer) clearTimeout(this.cancelTimer);
    this.cancelTimer = null;
    this.cancelPermissions();
    const wasRunning = this.transport !== null;
    this.disconnect();
    this.turnTitle = '';
    if (wasRunning || this.status.state !== 'idle') {
      this.setStatus({ state: 'stopped' });
    }
    await Promise.resolve();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

function lockedByAgent(agentName: string): RequestError {
  return RequestError.invalidRequest(
    undefined,
    `${agentName} is changing this file in parallel and its change waits for review. Try again later or work on another file.`,
  );
}

function denied(): RequestError {
  return RequestError.invalidRequest(undefined, 'Permission denied by the user or a rule.');
}

/** ACP "line" is 1-based; "limit" is a number of lines. */
export function sliceLines(content: string, line: number | null, limit: number | null): string {
  if (line === null && limit === null) return content;
  const lines = content.split('\n');
  const start = Math.max(0, (line ?? 1) - 1);
  const end = limit === null ? lines.length : start + limit;
  return lines.slice(start, end).join('\n');
}

function errorText(error: unknown, stderrTail: readonly string[]): string {
  const message = error instanceof Error ? error.message : String(error);
  const tail = stderrTail.slice(-5).join('\n');
  return tail ? `${message}\n${tail}` : message;
}
