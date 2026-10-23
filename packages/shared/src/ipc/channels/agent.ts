import { z } from 'zod';
import {
  agentConfigSchema,
  agentConfigViewSchema,
  agentEventSchema,
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
    request: z.object({ agentId: z.string(), resumeSessionId: z.string().max(200).optional() }),
    response: agentStatusSchema,
  },
  'agent:prompt': {
    request: z.object({ text: z.string().min(1).max(100_000) }),
    response: z.null(),
  },
  /** Asks the agent to stop the current turn (killed after a short grace period). */
  'agent:cancel': { request: z.undefined(), response: z.null() },
  /** Ends the agent process. */
  'agent:stop': { request: z.undefined(), response: z.null() },
  'agent:status': { request: z.undefined(), response: agentStatusSchema },
  'agent:listSessions': { request: z.undefined(), response: z.array(sessionSummarySchema) },
} as const;

export const agentEvents = {
  'agent:status': agentStatusSchema,
  'agent:event': z.object({ sessionId: z.string(), event: agentEventSchema }),
  /** A line of the agent's diagnostic output (stderr), secrets redacted. */
  'agent:log': z.object({ line: z.string(), time: z.number() }),
} as const;
