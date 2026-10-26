import { z } from 'zod';
import {
  mcpImportCandidateSchema,
  mcpScopeSchema,
  mcpServerConfigSchema,
  mcpServerIdSchema,
  mcpServerStatusSchema,
  mcpServerViewSchema,
  mcpToolLevelSchema,
} from '../../schemas/mcp';

const byServer = z.object({ id: mcpServerIdSchema, scope: mcpScopeSchema });

/** The MCP manager. Starting a new local server command needs a native confirmation. */
export const mcpChannels = {
  'mcp:list': {
    request: z.undefined(),
    response: z.object({
      servers: z.array(mcpServerViewSchema),
      statuses: z.array(mcpServerStatusSchema),
    }),
  },
  /** Saves a server (project scope needs an open folder). */
  'mcp:save': { request: mcpServerConfigSchema, response: mcpServerViewSchema },
  'mcp:delete': { request: byServer, response: z.null() },
  /** Sets (or with null removes) a secret env variable / header value. */
  'mcp:setSecret': {
    request: byServer.extend({
      name: z.string().max(100),
      value: z.string().max(10_000).nullable(),
    }),
    response: z.null(),
  },
  /** Connects (starting a local server) and lists its tools. */
  'mcp:test': { request: byServer, response: mcpServerStatusSchema },
  'mcp:setToolEnabled': {
    request: byServer.extend({ tool: z.string().max(200), enabled: z.boolean() }),
    response: z.null(),
  },
  /** Stores allow/deny as a permission rule; "ask" removes the rule. */
  'mcp:setToolLevel': {
    request: byServer.extend({ tool: z.string().max(200), level: mcpToolLevelSchema }),
    response: z.null(),
  },
  /** Servers in the project's .mcp.json. */
  'mcp:previewImport': { request: z.undefined(), response: z.array(mcpImportCandidateSchema) },
  'mcp:import': {
    request: z.object({ ids: z.array(mcpServerIdSchema).max(100) }),
    response: z.object({ imported: z.number().int() }),
  },
} as const;

export const mcpEvents = {
  'mcp:changed': z.object({}),
  /** A line of a local server's diagnostic output (stderr), secrets redacted. */
  'mcp:log': z.object({ line: z.string(), time: z.number() }),
} as const;
