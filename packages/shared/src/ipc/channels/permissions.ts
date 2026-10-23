import { z } from 'zod';
import {
  auditEntrySchema,
  permissionDecisionSchema,
  permissionKindSchema,
  permissionRequestSchema,
  permissionRuleSchema,
} from '../../schemas/permissions';

export const permissionChannels = {
  'permissions:respond': {
    request: z.object({ requestId: z.string(), decision: permissionDecisionSchema }),
    response: z.null(),
  },
  /** Open questions of this window (e.g. after a reload). */
  'permissions:pending': { request: z.undefined(), response: z.array(permissionRequestSchema) },
  /** Rules for the open project plus global rules. */
  'permissions:listRules': { request: z.undefined(), response: z.array(permissionRuleSchema) },
  'permissions:addRule': {
    request: z.object({
      kind: permissionKindSchema,
      pattern: z.string().min(1).max(4096),
      level: z.enum(['allow', 'deny']),
      scope: z.enum(['project', 'global']),
    }),
    response: permissionRuleSchema,
  },
  'permissions:deleteRule': { request: z.object({ id: z.string() }), response: z.null() },
  'permissions:log': {
    request: z.object({ limit: z.number().int().min(1).max(1000) }),
    response: z.array(auditEntrySchema),
  },
} as const;

export const permissionEvents = {
  'permissions:request': permissionRequestSchema,
  /** A request was answered or cancelled (e.g. the agent stopped). */
  'permissions:resolved': z.object({ id: z.string() }),
  'permissions:logged': auditEntrySchema,
} as const;
