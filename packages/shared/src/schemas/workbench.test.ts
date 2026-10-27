import { describe, expect, it } from 'vitest';
import {
  builtinProfiles,
  defaultWorkbench,
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
