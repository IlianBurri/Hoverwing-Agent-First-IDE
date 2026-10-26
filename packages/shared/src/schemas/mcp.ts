import { z } from 'zod';

/** Also the prefix of the tool names agents see ("<id>__<tool>"). */
export const mcpServerIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const variableName = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_-]*$/)
  .max(100);

export const mcpScopeSchema = z.enum(['global', 'project']);
export type McpScope = z.infer<typeof mcpScopeSchema>;

export const mcpTransportSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stdio'),
    command: z.string().min(1).max(1024),
    args: z.array(z.string().max(4096)).max(64),
    /** Names of environment variables; values live in the secret store. */
    env: z.array(variableName).max(32),
  }),
  z.object({
    type: z.literal('http'),
    url: z
      .string()
      .max(2048)
      .regex(/^https?:\/\/[^\s]+$/),
    /** Names of HTTP headers (e.g. Authorization); values live in the secret store. */
    headers: z.array(variableName).max(16),
  }),
]);
export type McpTransport = z.infer<typeof mcpTransportSchema>;

export const mcpServerConfigSchema = z.object({
  id: mcpServerIdSchema,
  name: z.string().min(1).max(80),
  scope: mcpScopeSchema,
  enabled: z.boolean(),
  /**
   * Offer the server's tools to agents in the Docker sandbox too. Local
   * servers run on the host with the user's rights, so this is off for them
   * by default.
   */
  sandboxAccess: z.boolean(),
  transport: mcpTransportSchema,
  /** Tools the user switched off (not offered to agents). */
  disabledTools: z.array(z.string().max(200)).max(500),
});
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;

/** What the UI sees: never secret values, only whether they are set. */
export const mcpServerViewSchema = mcpServerConfigSchema.extend({
  secretsSet: z.record(z.string(), z.boolean()),
});
export type McpServerView = z.infer<typeof mcpServerViewSchema>;

export const mcpToolLevelSchema = z.enum(['allow', 'ask', 'deny']);
export type McpToolLevel = z.infer<typeof mcpToolLevelSchema>;

export const mcpToolInfoSchema = z.object({
  name: z.string(),
  /** From the server: untrusted text, display only. */
  description: z.string(),
  enabled: z.boolean(),
  level: mcpToolLevelSchema,
});
export type McpToolInfo = z.infer<typeof mcpToolInfoSchema>;

export const mcpServerStatusSchema = z.object({
  id: mcpServerIdSchema,
  scope: mcpScopeSchema,
  state: z.enum(['idle', 'connecting', 'connected', 'error']),
  /** Short reason for errors (no paths or secrets). */
  error: z.string().nullable(),
  /** Tools from the last successful connection. */
  tools: z.array(mcpToolInfoSchema),
});
export type McpServerStatus = z.infer<typeof mcpServerStatusSchema>;

/** A server found in the project's .mcp.json, before importing it. */
export const mcpImportCandidateSchema = z.object({
  id: mcpServerIdSchema,
  name: z.string(),
  transport: mcpTransportSchema,
  /** Variable/header names that come with values (stored as secrets). */
  secretNames: z.array(z.string()),
  exists: z.boolean(),
});
export type McpImportCandidate = z.infer<typeof mcpImportCandidateSchema>;

/** Name of a tool as agents see it. */
export function proxiedToolName(serverId: string, tool: string): string {
  return `${serverId}__${tool}`;
}

/** Permission target of an MCP tool (rules use it as exact pattern). */
export function mcpToolTarget(serverId: string, tool: string): string {
  return `${serverId}/${tool}`;
}
