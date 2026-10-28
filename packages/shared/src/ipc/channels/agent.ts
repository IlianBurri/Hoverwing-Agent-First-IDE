import { z } from 'zod';
import {
  agentConfigSchema,
  agentConfigViewSchema,
  agentEventSchema,
  agentSlotIdSchema,
  agentSlotSchema,
  agentStatusSchema,
  sessionSummarySchema,
} from '../../schemas/agent';

export const agentChannels = {
  'agent:listConfigs': { request: z.undefined(), response: z.array(agentConfigViewSchema) },
  'agent:saveConfig': { request: agentConfigSchema, response: agentConfigViewSchema },
  'agent:deleteConfig': { request: z.object({ id: z.string() }), response: z.null() },
  /** Sets (or with null removes) a secret environment variable of an agent. */
  'agent:setEnv': {
    request: z.object({
      agentId: z.string(),
      name: z.string(),
      value: z.string().max(10_000).nullable(),
    }),
    response: z.null(),
  },
  /** Starts the agent process and a new (or resumed) session in the open folder. */
  'agent:start': {
    request: z.object({
      slotId: agentSlotIdSchema,
      agentId: z.string(),
      resumeSessionId: z.string().max(200).optional(),
    }),
    response: agentStatusSchema,
  },
  'agent:prompt': {
    request: z.object({ slotId: agentSlotIdSchema, text: z.string().min(1).max(100_000) }),
    response: z.null(),
  },
  /** Asks the agent to stop the current turn (killed after a short grace period). */
  'agent:cancel': { request: z.object({ slotId: agentSlotIdSchema }), response: z.null() },
  /** Ends the agent process; the slot stays (it can be started again). */
  'agent:stop': { request: z.object({ slotId: agentSlotIdSchema }), response: z.null() },
  /** Ends the agent process and forgets the slot (tab closed). */
  'agent:close': { request: z.object({ slotId: agentSlotIdSchema }), response: z.null() },
  /** All agent slots of the window. */
  'agent:slots': { request: z.undefined(), response: z.array(agentSlotSchema) },
  'agent:listSessions': { request: z.undefined(), response: z.array(sessionSummarySchema) },
} as const;

export const agentEvents = {
  'agent:status': agentSlotSchema,
  'agent:event': z.object({
    slotId: agentSlotIdSchema,
    sessionId: z.string(),
    event: agentEventSchema,
  }),
  /** A line of the agent's diagnostic output (stderr), secrets redacted. */
  'agent:log': z.object({ slotId: agentSlotIdSchema, line: z.string(), time: z.number() }),
} as const;
