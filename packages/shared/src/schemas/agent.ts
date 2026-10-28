import { z } from 'zod';
import { agentSandboxSchema, defaultAgentSandbox } from './sandbox';

export const agentConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  name: z.string().min(1).max(80),
  /** Program to start, e.g. "npx" or "/usr/local/bin/gemini". */
  command: z.string().min(1).max(1024),
  args: z.array(z.string().max(4096)).max(64),
  /** Names of environment variables; values live in the secret store. */
  env: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)).max(32),
  /** Hold back file writes until the user accepted them in the diff review. */
  reviewChanges: z.boolean(),
  /** Older configs have no sandbox settings: they keep running directly. */
  sandbox: agentSandboxSchema.default(defaultAgentSandbox),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;

/** What the UI sees: never secret values, only whether they are set. */
export const agentConfigViewSchema = agentConfigSchema.extend({
  envSet: z.record(z.string(), z.boolean()),
});
export type AgentConfigView = z.infer<typeof agentConfigViewSchema>;

export const toolKindSchema = z.enum([
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'think',
  'fetch',
  'switch_mode',
  'other',
]);

export const toolCallViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: toolKindSchema,
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  /** Affected files, relative to the project when inside it. */
  locations: z.array(z.string()),
  /** Unified diffs of proposed or applied file changes. */
  diffs: z.array(z.object({ path: z.string(), patch: z.string() })),
  /** Text output of the tool (shortened). Untrusted: display only. */
  output: z.string(),
});
export type ToolCallView = z.infer<typeof toolCallViewSchema>;

export const planEntrySchema = z.object({
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  priority: z.enum(['high', 'medium', 'low']),
});
export type PlanEntry = z.infer<typeof planEntrySchema>;

/** Kestrel's own, small event model; main translates ACP into it. */
export const agentEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message'),
    role: z.enum(['user', 'agent', 'thought']),
    text: z.string(),
  }),
  z.object({ type: z.literal('toolCall'), toolCall: toolCallViewSchema }),
  z.object({ type: z.literal('plan'), entries: z.array(planEntrySchema) }),
  z.object({ type: z.literal('turnStarted'), checkpointId: z.string().nullable() }),
  z.object({
    type: z.literal('turnEnded'),
    stopReason: z.enum([
      'end_turn',
      'max_tokens',
      'max_turn_requests',
      'refusal',
      'cancelled',
      'error',
    ]),
  }),
  z.object({ type: z.literal('notice'), text: z.string() }),
]);
export type AgentEvent = z.infer<typeof agentEventSchema>;

export const agentOptionChoiceSchema = z.object({
  value: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Name of the group the agent put this value in, if any. */
  group: z.string().nullable(),
});
export type AgentOptionChoice = z.infer<typeof agentOptionChoiceSchema>;

/**
 * A setting the running agent offers for its session (model, effort, mode …),
 * translated from ACP config options, modes or the model list.
 */
export const agentOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.enum(['model', 'effort', 'mode', 'other']),
  value: z.union([z.string(), z.boolean()]),
  /** Selectable values; empty for on/off options. */
  choices: z.array(agentOptionChoiceSchema),
});
export type AgentOption = z.infer<typeof agentOptionSchema>;
export type AgentOptionValue = AgentOption['value'];

/** Context window use of the session, as reported by the agent. */
export const agentUsageSchema = z.object({ used: z.number(), size: z.number() });
export type AgentUsage = z.infer<typeof agentUsageSchema>;

export const agentStatusSchema = z.object({
  state: z.enum(['idle', 'starting', 'ready', 'working', 'stopped', 'error']),
  agentId: z.string().nullable(),
  agentName: z.string().nullable(),
  sessionId: z.string().nullable(),
  /** Short, translated-on-the-UI-side reason for errors. */
  error: z
    .enum(['spawnFailed', 'sandboxFailed', 'initFailed', 'authRequired', 'crashed', 'protocol'])
    .nullable(),
  /** Extra details for the user (e.g. stderr tail); never contains secrets. */
  detail: z.string().nullable(),
  canLoadSession: z.boolean(),
  /** Where the agent runs: in the Docker sandbox or directly on the system. */
  sandboxed: z.boolean(),
  /** Settings the agent offers for this session (empty if none). */
  options: z.array(agentOptionSchema),
  usage: agentUsageSchema.nullable(),
});
export type AgentStatus = z.infer<typeof agentStatusSchema>;

/** Parallel agents of one window: each runs in a slot the renderer names. */
export const agentSlotIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/);
export const MAX_AGENT_SLOTS = 4;

export const agentSlotSchema = z.object({ slotId: agentSlotIdSchema, status: agentStatusSchema });
export type AgentSlot = z.infer<typeof agentSlotSchema>;

export const sessionSummarySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  title: z.string(),
  time: z.number(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const idleAgentStatus: AgentStatus = {
  state: 'idle',
  agentId: null,
  agentName: null,
  sessionId: null,
  error: null,
  detail: null,
  canLoadSession: false,
  sandboxed: false,
  options: [],
  usage: null,
};
