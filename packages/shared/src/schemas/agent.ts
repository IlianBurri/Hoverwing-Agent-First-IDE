import { z } from 'zod';

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

export const agentStatusSchema = z.object({
  state: z.enum(['idle', 'starting', 'ready', 'working', 'stopped', 'error']),
  agentId: z.string().nullable(),
  agentName: z.string().nullable(),
  sessionId: z.string().nullable(),
  /** Short, translated-on-the-UI-side reason for errors. */
  error: z.enum(['spawnFailed', 'initFailed', 'authRequired', 'crashed', 'protocol']).nullable(),
  /** Extra details for the user (e.g. stderr tail); never contains secrets. */
  detail: z.string().nullable(),
  canLoadSession: z.boolean(),
});
export type AgentStatus = z.infer<typeof agentStatusSchema>;

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
};
