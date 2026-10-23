import { isAbsolute, relative, sep } from 'node:path';
import { createTwoFilesPatch } from 'diff';
import type {
  SessionUpdate,
  ToolCall,
  ToolCallContent,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';
import type { AgentEvent, ToolCallView } from '@kestrel/shared';

/** Longest tool output kept for display. */
const MAX_OUTPUT = 20_000;

/** Absolute agent paths become project-relative ("/" separators) when inside. */
export function displayPath(root: string, path: string): string {
  if (!isAbsolute(path)) return path.split(sep).join('/');
  const rel = relative(root, path);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return path;
  return rel.split(sep).join('/');
}

export function unifiedDiff(path: string, oldText: string | null, newText: string): string {
  return createTwoFilesPatch(path, path, oldText ?? '', newText, undefined, undefined, {
    context: 3,
  });
}

function contentText(content: readonly ToolCallContent[]): string {
  const parts: string[] = [];
  for (const item of content) {
    if (item.type === 'content' && item.content.type === 'text') parts.push(item.content.text);
  }
  const text = parts.join('\n');
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…` : text;
}

/**
 * Merges a tool_call or tool_call_update into the previous view of the same
 * call. Unknown fields in an update keep their previous value.
 */
export function mergeToolCall(
  root: string,
  previous: ToolCallView | undefined,
  update: ToolCall | ToolCallUpdate,
): ToolCallView {
  const base: ToolCallView = previous ?? {
    id: update.toolCallId,
    title: '',
    kind: 'other',
    status: 'pending',
    locations: [],
    diffs: [],
    output: '',
  };
  const content = update.content ?? null;
  return {
    ...base,
    title: update.title ?? base.title,
    kind: update.kind ?? base.kind,
    status: update.status ?? base.status,
    locations: update.locations
      ? update.locations.map((location) => displayPath(root, location.path))
      : base.locations,
    diffs: content
      ? content
          .filter((item) => item.type === 'diff')
          .map((item) => {
            const path = displayPath(root, item.path);
            return { path, patch: unifiedDiff(path, item.oldText ?? null, item.newText) };
          })
      : base.diffs,
    output: content ? contentText(content) : base.output,
  };
}

/** Translates one ACP session update into Kestrel events (or none). */
export function translateUpdate(
  root: string,
  update: SessionUpdate,
  toolCalls: Map<string, ToolCallView>,
): AgentEvent | null {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
    case 'user_message_chunk':
    case 'agent_thought_chunk': {
      if (update.content.type !== 'text') return null;
      const role =
        update.sessionUpdate === 'agent_message_chunk'
          ? 'agent'
          : update.sessionUpdate === 'user_message_chunk'
            ? 'user'
            : 'thought';
      return { type: 'message', role, text: update.content.text };
    }
    case 'tool_call':
    case 'tool_call_update': {
      const view = mergeToolCall(root, toolCalls.get(update.toolCallId), update);
      toolCalls.set(view.id, view);
      return { type: 'toolCall', toolCall: view };
    }
    case 'plan':
      return {
        type: 'plan',
        entries: update.entries.map((entry) => ({
          content: entry.content,
          status: entry.status,
          priority: entry.priority,
        })),
      };
    default:
      // Modes, commands, usage … are not shown yet.
      return null;
  }
}
