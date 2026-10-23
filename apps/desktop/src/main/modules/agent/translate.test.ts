import { describe, expect, it } from 'vitest';
import type { ToolCallView } from '@kestrel/shared';
import { displayPath, translateUpdate } from './translate';

const root = '/home/me/project';

describe('displayPath', () => {
  it('makes project paths relative and leaves others alone', () => {
    expect(displayPath(root, '/home/me/project/src/a.ts')).toBe('src/a.ts');
    expect(displayPath(root, '/etc/hosts')).toBe('/etc/hosts');
    expect(displayPath(root, '/home/me/project-other/x')).toBe('/home/me/project-other/x');
  });
});

describe('translateUpdate', () => {
  it('turns message chunks into message events', () => {
    const calls = new Map<string, ToolCallView>();
    expect(
      translateUpdate(
        root,
        { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hi' } },
        calls,
      ),
    ).toEqual({ type: 'message', role: 'agent', text: 'Hi' });
    expect(
      translateUpdate(
        root,
        { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'hmm' } },
        calls,
      ),
    ).toEqual({ type: 'message', role: 'thought', text: 'hmm' });
  });

  it('merges tool call updates and renders diffs', () => {
    const calls = new Map<string, ToolCallView>();
    translateUpdate(
      root,
      {
        sessionUpdate: 'tool_call',
        toolCallId: 't1',
        title: 'Edit src/a.ts',
        kind: 'edit',
        status: 'pending',
        locations: [{ path: '/home/me/project/src/a.ts' }],
        content: [
          { type: 'diff', path: '/home/me/project/src/a.ts', oldText: 'a\n', newText: 'b\n' },
        ],
      },
      calls,
    );
    const event = translateUpdate(
      root,
      { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' },
      calls,
    );
    expect(event).toMatchObject({
      type: 'toolCall',
      toolCall: {
        id: 't1',
        title: 'Edit src/a.ts',
        kind: 'edit',
        status: 'completed',
        locations: ['src/a.ts'],
      },
    });
    const diff = event?.type === 'toolCall' ? event.toolCall.diffs[0] : undefined;
    expect(diff?.path).toBe('src/a.ts');
    expect(diff?.patch).toContain('-a');
    expect(diff?.patch).toContain('+b');
  });

  it('maps plans', () => {
    expect(
      translateUpdate(
        root,
        {
          sessionUpdate: 'plan',
          entries: [{ content: 'Write tests', status: 'in_progress', priority: 'high' }],
        },
        new Map(),
      ),
    ).toEqual({
      type: 'plan',
      entries: [{ content: 'Write tests', status: 'in_progress', priority: 'high' }],
    });
  });

  it('ignores updates the UI does not show', () => {
    expect(
      translateUpdate(
        root,
        { sessionUpdate: 'current_mode_update', currentModeId: 'plan' },
        new Map(),
      ),
    ).toBeNull();
  });
});
