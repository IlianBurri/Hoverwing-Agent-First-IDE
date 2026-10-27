import { describe, expect, it } from 'vitest';
import {
  builtinProfiles,
  defaultWorkbench,
  describeChanges,
  extractJson,
  layoutProposalSchema,
  mergeProposal,
  fullOrder,
  mainPanelOrder,
  orderedVisible,
  workbenchSchema,
} from './workbench';

describe('workbench helpers', () => {
  it('keeps the user order, appends unknown entries and drops hidden or duplicate ones', () => {
    const all = ['a', 'b', 'c', 'd'] as const;
    expect(orderedVisible(all, ['c', 'a', 'c'], ['b'])).toEqual(['c', 'a', 'd']);
    expect(fullOrder(all, ['d'])).toEqual(['d', 'a', 'b', 'c']);
    expect(orderedVisible(all, [], [])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('places the sidebar outermost on its side', () => {
    expect(mainPanelOrder({ sidebarSide: 'left', agentSide: 'right' })).toEqual([
      'sidebar',
      'center',
      'agent',
    ]);
    expect(mainPanelOrder({ sidebarSide: 'right', agentSide: 'left' })).toEqual([
      'agent',
      'center',
      'sidebar',
    ]);
    expect(mainPanelOrder({ sidebarSide: 'right', agentSide: 'right' })).toEqual([
      'center',
      'agent',
      'sidebar',
    ]);
    expect(mainPanelOrder({ sidebarSide: 'left', agentSide: 'left' })).toEqual([
      'sidebar',
      'agent',
      'center',
    ]);
  });

  it('ships valid profiles and rejects unknown entries', () => {
    for (const profile of builtinProfiles) {
      expect(workbenchSchema.safeParse(profile.workbench).success).toBe(true);
    }
    expect(
      workbenchSchema.safeParse({
        ...defaultWorkbench,
        statusBar: { visible: true, hidden: ['trust'] },
      }).success,
    ).toBe(false);
  });
});

describe('layout proposals', () => {
  const current = {
    workbench: defaultWorkbench,
    toolbar: ['git.pull', 'git.push'],
    sidebarView: 'files' as const,
    bottomView: 'terminal' as const,
  };
  const known = new Set(['git.pull', 'git.push', 'agent.start', 'terminal.new']);

  it('merges a partial proposal and drops unknown commands', () => {
    const merged = mergeProposal(
      current,
      layoutProposalSchema.parse({
        workbench: { sidebarSide: 'right', statusBar: { visible: false } },
        toolbar: ['agent.start', 'evil.command', 'git.push', 'agent.start'],
        sidebarView: 'git',
      }),
      known,
    );
    expect(merged.workbench.sidebarSide).toBe('right');
    expect(merged.workbench.agentSide).toBe('right');
    expect(merged.workbench.statusBar).toEqual({ visible: false, hidden: [] });
    expect(merged.toolbar).toEqual(['agent.start', 'git.push']);
    expect(merged.sidebarView).toBe('git');

    expect(describeChanges(current, merged)).toEqual([
      { kind: 'side', panel: 'sidebar', side: 'right' },
      { kind: 'barVisible', bar: 'statusBar', visible: false },
      { kind: 'toolbarAdd', command: 'agent.start' },
      { kind: 'toolbarRemove', command: 'git.pull' },
      { kind: 'view', area: 'sidebar', view: 'git' },
    ]);
  });

  it('keeps one bottom tab visible and rejects unknown fields values', () => {
    const merged = mergeProposal(
      current,
      layoutProposalSchema.parse({
        workbench: { bottomTabs: { hidden: ['terminal', 'logs', 'problems', 'docker'] } },
      }),
      known,
    );
    expect(merged.workbench.bottomTabs.hidden).not.toContain('terminal');
    expect(layoutProposalSchema.safeParse({ workbench: { sidebarSide: 'top' } }).success).toBe(
      false,
    );
    expect(
      layoutProposalSchema.safeParse({ workbench: { statusBar: { hidden: ['trust'] } } }).success,
    ).toBe(false);
  });

  it('finds JSON in plain, fenced or chatty answers', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here:\n```json\n{"a":2}\n```\nDone')).toEqual({ a: 2 });
    expect(extractJson('Sure! {"a":3} hope it helps')).toEqual({ a: 3 });
    expect(extractJson('no json here')).toBeNull();
  });
});
