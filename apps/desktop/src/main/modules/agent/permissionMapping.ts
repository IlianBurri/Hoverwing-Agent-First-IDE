import type { PermissionOption, RequestPermissionOutcome } from '@agentclientprotocol/sdk';
import type { PermissionKind, ToolCallView } from '@kestrel/shared';
import type { PermissionAction } from '../permissions';

const kindByTool: Record<ToolCallView['kind'], PermissionKind> = {
  read: 'file.read',
  search: 'file.read',
  edit: 'file.write',
  move: 'file.write',
  delete: 'file.delete',
  execute: 'command.run',
  fetch: 'network',
  think: 'mcp.tool',
  switch_mode: 'mcp.tool',
  other: 'mcp.tool',
};

function commandOf(rawInput: unknown): string | null {
  if (typeof rawInput !== 'object' || rawInput === null) return null;
  const command = (rawInput as { command?: unknown }).command;
  if (typeof command === 'string') return command;
  if (Array.isArray(command) && command.every((part) => typeof part === 'string'))
    return command.join(' ');
  return null;
}

/** Describes the agent's permission request as a Kestrel permission action. */
export function actionForToolCall(toolCall: ToolCallView, rawInput: unknown): PermissionAction {
  const kind = kindByTool[toolCall.kind];
  let target = toolCall.title;
  if (kind === 'command.run') target = commandOf(rawInput) ?? toolCall.title;
  else if (toolCall.locations[0]) target = toolCall.locations[0];
  return {
    kind,
    target,
    title: toolCall.title,
    diff: toolCall.diffs.length > 0 ? toolCall.diffs.map((diff) => diff.patch).join('\n') : null,
  };
}

/**
 * The answer for the agent. "Always" is remembered by Kestrel's own rules,
 * so the agent only ever gets a one-time allow or reject where possible.
 */
export function outcomeFor(
  allowed: boolean,
  options: readonly PermissionOption[],
): RequestPermissionOutcome {
  const preference = allowed ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always'];
  for (const kind of preference) {
    const option = options.find((entry) => entry.kind === kind);
    if (option) return { outcome: 'selected', optionId: option.optionId };
  }
  return { outcome: 'cancelled' };
}
