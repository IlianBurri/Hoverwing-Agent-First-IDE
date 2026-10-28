import { randomUUID } from 'node:crypto';
import { evaluatePolicy } from '@kestrel/shared';
import type {
  AuditEntry,
  PermissionDecision,
  PermissionKind,
  PermissionRequest,
  PermissionRule,
} from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { redact } from '../../lib/redact';
import type { AuditLog } from './audit';
import type { RuleStore } from './rules';

export interface PermissionContext {
  /** Window that owns the agent session (webContents id). */
  ownerId: number;
  /** Open project folder, or null. */
  root: string | null;
  agentName: string;
  sessionId: string;
  /** Agent tab the action comes from (parallel agents of a window). */
  slotId?: string;
}

export interface PermissionAction {
  kind: PermissionKind;
  target: string;
  /** Short description, e.g. from the agent's tool call. */
  title: string;
  diff?: string | null;
}

export interface PermissionEvents {
  request(ownerId: number, request: PermissionRequest): void;
  resolved(ownerId: number, id: string): void;
  logged(ownerId: number, entry: AuditEntry): void;
}

interface Pending {
  request: PermissionRequest;
  context: PermissionContext;
  resolve: (allowed: boolean) => void;
}

/**
 * The single gate for risky actions. Every agent action calls `check`;
 * rules decide, otherwise the user is asked. Every outcome is logged.
 */
export class PermissionService {
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly rules: RuleStore,
    private readonly audit: AuditLog,
    private readonly events: PermissionEvents,
  ) {}

  async check(context: PermissionContext, action: PermissionAction): Promise<boolean> {
    const rules = await this.rules.rulesFor(context.root);
    const policy = evaluatePolicy(action.kind, action.target, rules);
    if (policy.level !== 'ask') {
      const allowed = policy.level === 'allow';
      await this.log(context, action, allowed, policy.decidedBy ?? 'rule');
      return allowed;
    }

    const request: PermissionRequest = {
      id: randomUUID(),
      kind: action.kind,
      target: action.target,
      title: redact(action.title).slice(0, 500),
      diff: action.diff ?? null,
      agentName: context.agentName,
      sessionId: context.sessionId,
      slotId: context.slotId ?? null,
      createdAt: Date.now(),
    };
    const allowed = await new Promise<boolean>((resolve) => {
      this.pending.set(request.id, { request, context, resolve });
      this.events.request(context.ownerId, request);
    });
    return allowed;
  }

  /**
   * Checks rules without asking the user (e.g. for writes that are held for
   * review anyway). Logs and returns true when the action is denied.
   */
  async denies(context: PermissionContext, action: PermissionAction): Promise<boolean> {
    const policy = evaluatePolicy(
      action.kind,
      action.target,
      await this.rules.rulesFor(context.root),
    );
    if (policy.level !== 'deny') return false;
    await this.log(context, action, false, policy.decidedBy ?? 'rule');
    return true;
  }

  async respond(ownerId: number, requestId: string, decision: PermissionDecision): Promise<void> {
    const entry = this.pending.get(requestId);
    if (entry?.context.ownerId !== ownerId) {
      throw new UserError('not_found', 'Permission request not found.');
    }
    this.pending.delete(requestId);
    const { request, context } = entry;
    if (decision === 'allowAlways') {
      await this.rules.add(context.root, {
        kind: request.kind,
        pattern: request.target,
        level: 'allow',
        scope: context.root === null ? 'global' : 'project',
      });
    }
    const allowed = decision !== 'deny';
    await this.log(context, request, allowed, 'user');
    this.events.resolved(ownerId, requestId);
    entry.resolve(allowed);
  }

  /** Denies all open questions of a window or of one agent tab (e.g. on stop). */
  cancel(ownerId: number, slotId?: string): void {
    for (const [id, entry] of this.pending) {
      if (entry.context.ownerId !== ownerId) continue;
      if (slotId !== undefined && entry.context.slotId !== slotId) continue;
      this.pending.delete(id);
      void this.log(entry.context, entry.request, false, 'cancelled');
      this.events.resolved(ownerId, id);
      entry.resolve(false);
    }
  }

  pendingFor(ownerId: number): PermissionRequest[] {
    return [...this.pending.values()]
      .filter((entry) => entry.context.ownerId === ownerId)
      .map((entry) => entry.request);
  }

  listRules(root: string | null): Promise<PermissionRule[]> {
    return this.rules.rulesFor(root);
  }

  addRule(
    root: string | null,
    rule: Omit<PermissionRule, 'id' | 'createdAt'>,
  ): Promise<PermissionRule> {
    return this.rules.add(root, rule);
  }

  deleteRule(root: string | null, id: string): Promise<void> {
    return this.rules.delete(root, id);
  }

  readLog(root: string | null, limit: number): Promise<AuditEntry[]> {
    return this.audit.read(root, limit);
  }

  private async log(
    context: PermissionContext,
    action: Pick<PermissionAction, 'kind' | 'target'>,
    allowed: boolean,
    decidedBy: AuditEntry['decidedBy'],
  ): Promise<void> {
    try {
      const entry = await this.audit.append(context.root, {
        id: randomUUID(),
        time: Date.now(),
        kind: action.kind,
        target: action.target,
        agentName: context.agentName,
        outcome: allowed ? 'allowed' : 'denied',
        decidedBy,
      });
      this.events.logged(context.ownerId, entry);
    } catch (error) {
      console.error('[permissions] could not write audit log', error);
    }
  }
}
