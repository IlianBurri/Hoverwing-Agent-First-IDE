import { z } from 'zod';
import { matchesGlob } from './glob';

/** Every kind of risky action goes through the permission system. */
export const permissionKindSchema = z.enum([
  'file.read',
  'file.write',
  'file.delete',
  'command.run',
  'network',
  /** Read a browser tab (screenshot, console, network errors). */
  'browser',
  /** Open pages in the integrated browser. */
  'browser.control',
  'mcp.tool',
  'docker',
]);
export type PermissionKind = z.infer<typeof permissionKindSchema>;

export const permissionLevelSchema = z.enum(['allow', 'ask', 'deny']);
export type PermissionLevel = z.infer<typeof permissionLevelSchema>;

export const permissionRuleSchema = z.object({
  id: z.string(),
  kind: permissionKindSchema,
  /** Glob for paths ("src/**"), or the exact target, e.g. a command line. */
  pattern: z.string().min(1).max(4096),
  level: z.enum(['allow', 'deny']),
  scope: z.enum(['project', 'global']),
  createdAt: z.number(),
});
export type PermissionRule = z.infer<typeof permissionRuleSchema>;

/** A pending question to the user, shown as a card in the agent panel. */
export const permissionRequestSchema = z.object({
  id: z.string(),
  kind: permissionKindSchema,
  /** What the action is about: a relative path, a command line, a URL … */
  target: z.string(),
  /** Short description from the agent. Untrusted text: display only. */
  title: z.string(),
  /** Unified diff for file writes, if available. */
  diff: z.string().nullable(),
  agentName: z.string(),
  sessionId: z.string(),
  /** Agent tab (parallel agents of a window) the question belongs to. */
  slotId: z.string().nullable(),
  createdAt: z.number(),
});
export type PermissionRequest = z.infer<typeof permissionRequestSchema>;

export const permissionDecisionSchema = z.enum(['allowOnce', 'allowAlways', 'deny']);
export type PermissionDecision = z.infer<typeof permissionDecisionSchema>;

export const auditEntrySchema = z.object({
  id: z.string(),
  time: z.number(),
  kind: permissionKindSchema,
  target: z.string(),
  agentName: z.string(),
  outcome: z.enum(['allowed', 'denied']),
  /** Who decided: a stored rule, the user, the sensitive-file guard, or a cancel. */
  decidedBy: z.enum(['rule', 'user', 'sensitive', 'cancelled']),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/**
 * Files that hold secrets. Agents may neither read nor write them through
 * Hoverwing, whatever the rules say.
 */
export const SENSITIVE_FILE_PATTERNS: readonly string[] = [
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/id_rsa*',
  '**/id_ed25519*',
  '**/id_ecdsa*',
  '**/.ssh/**',
  '**/.aws/**',
  '**/.gnupg/**',
  '**/.npmrc',
  '**/.pypirc',
  '**/.netrc',
  '**/.git-credentials',
];

/** Templates that only show which variables exist, without values. */
const SAFE_EXCEPTIONS: readonly string[] = [
  '**/.env.example',
  '**/.env.sample',
  '**/.env.template',
];

export function isSensitivePath(path: string): boolean {
  if (SAFE_EXCEPTIONS.some((glob) => matchesGlob(path, glob))) return false;
  return SENSITIVE_FILE_PATTERNS.some((glob) => matchesGlob(path, glob));
}

export function isFileKind(kind: PermissionKind): boolean {
  return kind === 'file.read' || kind === 'file.write' || kind === 'file.delete';
}

export interface PolicyResult {
  level: PermissionLevel;
  decidedBy: 'rule' | 'sensitive' | null;
}

function ruleMatches(rule: PermissionRule, kind: PermissionKind, target: string): boolean {
  if (rule.kind !== kind) return false;
  // Paths use globs; other targets (commands, URLs) must match exactly or "**".
  return isFileKind(kind)
    ? matchesGlob(target, rule.pattern)
    : rule.pattern === '**' || rule.pattern === target;
}

/**
 * Decides what happens with an action. Order: secret files are always
 * denied; a matching deny rule beats a matching allow rule; without any
 * matching rule the user is asked (the safe default).
 */
export function evaluatePolicy(
  kind: PermissionKind,
  target: string,
  rules: readonly PermissionRule[],
): PolicyResult {
  if (isFileKind(kind) && isSensitivePath(target)) return { level: 'deny', decidedBy: 'sensitive' };
  const matching = rules.filter((rule) => ruleMatches(rule, kind, target));
  if (matching.some((rule) => rule.level === 'deny')) return { level: 'deny', decidedBy: 'rule' };
  if (matching.some((rule) => rule.level === 'allow')) return { level: 'allow', decidedBy: 'rule' };
  return { level: 'ask', decidedBy: null };
}
