import { z } from 'zod';

/*
 * The arrangement of the workbench: which side panels sit on, what is open,
 * and which entries the bars and tabs show. Everything is plain data checked
 * by these schemas, so it can be saved as a profile (and, later, proposed by
 * a model) without touching anything but the layout.
 */

export const sidebarViews = ['files', 'search', 'git', 'docker', 'mcp', 'models'] as const;
export const bottomViews = ['terminal', 'logs', 'problems', 'docker'] as const;
/** Status bar entries that can be hidden (security notices cannot). */
export const statusItems = [
  'agent',
  'model',
  'completion',
  'git',
  'containers',
  'problems',
  'cursor',
  'project',
] as const;

export const sidebarViewSchema = z.enum(sidebarViews);
export type SidebarView = z.infer<typeof sidebarViewSchema>;

export const bottomViewSchema = z.enum(bottomViews);
export type BottomView = z.infer<typeof bottomViewSchema>;

export const statusItemSchema = z.enum(statusItems);
export type StatusItem = z.infer<typeof statusItemSchema>;

export const panelSideSchema = z.enum(['left', 'right']);
export type PanelSide = z.infer<typeof panelSideSchema>;

const orderedListSchema = <T extends z.ZodType>(item: T) =>
  z.object({ order: z.array(item).max(20), hidden: z.array(item).max(20) });

export const workbenchSchema = z.object({
  sidebarSide: panelSideSchema,
  agentSide: panelSideSchema,
  /** Open (true) or collapsed panels, restored on start. */
  panels: z.object({ sidebar: z.boolean(), bottom: z.boolean(), agent: z.boolean() }),
  activityBar: orderedListSchema(sidebarViewSchema).extend({ visible: z.boolean() }),
  bottomTabs: orderedListSchema(bottomViewSchema),
  statusBar: z.object({ visible: z.boolean(), hidden: z.array(statusItemSchema).max(20) }),
});
export type Workbench = z.infer<typeof workbenchSchema>;

export const defaultWorkbench: Workbench = {
  sidebarSide: 'left',
  agentSide: 'right',
  panels: { sidebar: true, bottom: true, agent: true },
  activityBar: { visible: true, order: [...sidebarViews], hidden: [] },
  bottomTabs: { order: [...bottomViews], hidden: [] },
  statusBar: { visible: true, hidden: [] },
};

export const layoutProfileSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1).max(60),
  workbench: workbenchSchema,
  /** Optional: the views to show in sidebar and bottom panel. */
  sidebarView: sidebarViewSchema.optional(),
  bottomView: bottomViewSchema.optional(),
});
export type LayoutProfile = z.infer<typeof layoutProfileSchema>;

/** Shipped profiles; their names are translated in the renderer. */
export const builtinProfiles: readonly Omit<LayoutProfile, 'name'>[] = [
  { id: 'standard', workbench: defaultWorkbench },
  {
    id: 'focus',
    workbench: { ...defaultWorkbench, panels: { sidebar: false, bottom: false, agent: false } },
  },
  {
    id: 'agent',
    workbench: { ...defaultWorkbench, panels: { sidebar: false, bottom: false, agent: true } },
  },
  {
    id: 'review',
    workbench: { ...defaultWorkbench, panels: { sidebar: true, bottom: true, agent: true } },
    sidebarView: 'git',
    bottomView: 'problems',
  },
];

/**
 * The entries to show, in the user's order. Entries the order does not know
 * (e.g. added in a newer version) are appended; duplicates are dropped.
 */
export function orderedVisible<T extends string>(
  all: readonly T[],
  order: readonly T[],
  hidden: readonly T[],
): T[] {
  const known = order.filter((item, index) => all.includes(item) && order.indexOf(item) === index);
  return [...known, ...all.filter((item) => !known.includes(item))].filter(
    (item) => !hidden.includes(item),
  );
}

/** Full order (incl. hidden entries), for settings dialogs. */
export function fullOrder<T extends string>(all: readonly T[], order: readonly T[]): T[] {
  return orderedVisible(all, order, []);
}

/** Panels of the main row from left to right; the sidebar is outermost on its side. */
export function mainPanelOrder(workbench: Pick<Workbench, 'sidebarSide' | 'agentSide'>) {
  const left: ('sidebar' | 'agent')[] = [];
  const right: ('sidebar' | 'agent')[] = [];
  (workbench.sidebarSide === 'left' ? left : right).push('sidebar');
  if (workbench.agentSide === 'left') left.push('agent');
  else right.unshift('agent');
  return [...left, 'center' as const, ...right];
}

/*
 * Layout proposals from a model (stage 3). The model may send only what it
 * changes; `mergeProposal` fills in the rest from the current layout and the
 * result is checked against the full schemas again.
 */

const partialList = <T extends z.ZodType>(item: T) =>
  z.object({ order: z.array(item).max(20), hidden: z.array(item).max(20) }).partial();

export const layoutProposalSchema = z.object({
  workbench: z
    .object({
      sidebarSide: panelSideSchema,
      agentSide: panelSideSchema,
      panels: z.object({ sidebar: z.boolean(), bottom: z.boolean(), agent: z.boolean() }).partial(),
      activityBar: partialList(sidebarViewSchema).extend({ visible: z.boolean().optional() }),
      bottomTabs: partialList(bottomViewSchema),
      statusBar: z
        .object({ visible: z.boolean(), hidden: z.array(statusItemSchema).max(20) })
        .partial(),
    })
    .partial()
    .optional(),
  /** Command ids for the title bar toolbar, in order. */
  toolbar: z.array(z.string().min(1).max(100)).max(30).optional(),
  sidebarView: sidebarViewSchema.optional(),
  bottomView: bottomViewSchema.optional(),
  /** Short explanation for the user (untrusted text, display only). */
  explanation: z.string().max(2000).optional(),
});
export type LayoutProposal = z.infer<typeof layoutProposalSchema>;

/** Everything a proposal can change. */
export interface LayoutState {
  workbench: Workbench;
  toolbar: string[];
  sidebarView: SidebarView;
  bottomView: BottomView;
}

/** Applies a (partial) proposal to the current state; unknown command ids are dropped. */
export function mergeProposal(
  current: LayoutState,
  proposal: LayoutProposal,
  knownCommands: ReadonlySet<string>,
): LayoutState {
  const patch = proposal.workbench ?? {};
  const wb = current.workbench;
  const workbench = workbenchSchema.parse({
    sidebarSide: patch.sidebarSide ?? wb.sidebarSide,
    agentSide: patch.agentSide ?? wb.agentSide,
    panels: { ...wb.panels, ...patch.panels },
    activityBar: { ...wb.activityBar, ...patch.activityBar },
    bottomTabs: { ...wb.bottomTabs, ...patch.bottomTabs },
    statusBar: { ...wb.statusBar, ...patch.statusBar },
  });
  // At least one bottom tab stays visible.
  if (bottomViews.every((view) => workbench.bottomTabs.hidden.includes(view))) {
    workbench.bottomTabs.hidden = workbench.bottomTabs.hidden.filter((view) => view !== 'terminal');
  }
  const toolbar = proposal.toolbar
    ? [...new Set(proposal.toolbar.filter((id) => knownCommands.has(id)))]
    : current.toolbar;
  return {
    workbench,
    toolbar,
    sidebarView: proposal.sidebarView ?? current.sidebarView,
    bottomView: proposal.bottomView ?? current.bottomView,
  };
}

/** One change between two layouts, for a preview in plain words. */
export type LayoutChange =
  | { kind: 'side'; panel: 'sidebar' | 'agent'; side: PanelSide }
  | { kind: 'panel'; panel: 'sidebar' | 'bottom' | 'agent'; open: boolean }
  | { kind: 'barVisible'; bar: 'activityBar' | 'statusBar'; visible: boolean }
  | { kind: 'activityItem' | 'bottomTab'; item: string; shown: boolean }
  | { kind: 'statusItem'; item: StatusItem; shown: boolean }
  | { kind: 'order'; list: 'activityBar' | 'bottomTabs' }
  | { kind: 'toolbarAdd' | 'toolbarRemove'; command: string }
  | { kind: 'toolbarOrder' }
  | { kind: 'view'; area: 'sidebar' | 'bottom'; view: string };

function shownChanges<T extends string>(
  all: readonly T[],
  before: readonly T[],
  after: readonly T[],
): { item: T; shown: boolean }[] {
  return all
    .filter((item) => before.includes(item) !== after.includes(item))
    .map((item) => ({ item, shown: !after.includes(item) }));
}

export function describeChanges(before: LayoutState, after: LayoutState): LayoutChange[] {
  const changes: LayoutChange[] = [];
  const a = before.workbench;
  const b = after.workbench;
  if (a.sidebarSide !== b.sidebarSide) {
    changes.push({ kind: 'side', panel: 'sidebar', side: b.sidebarSide });
  }
  if (a.agentSide !== b.agentSide)
    changes.push({ kind: 'side', panel: 'agent', side: b.agentSide });
  for (const panel of ['sidebar', 'bottom', 'agent'] as const) {
    if (a.panels[panel] !== b.panels[panel]) {
      changes.push({ kind: 'panel', panel, open: b.panels[panel] });
    }
  }
  if (a.activityBar.visible !== b.activityBar.visible) {
    changes.push({ kind: 'barVisible', bar: 'activityBar', visible: b.activityBar.visible });
  }
  if (a.statusBar.visible !== b.statusBar.visible) {
    changes.push({ kind: 'barVisible', bar: 'statusBar', visible: b.statusBar.visible });
  }
  for (const change of shownChanges(sidebarViews, a.activityBar.hidden, b.activityBar.hidden)) {
    changes.push({ kind: 'activityItem', ...change });
  }
  for (const change of shownChanges(bottomViews, a.bottomTabs.hidden, b.bottomTabs.hidden)) {
    changes.push({ kind: 'bottomTab', ...change });
  }
  for (const change of shownChanges(statusItems, a.statusBar.hidden, b.statusBar.hidden)) {
    changes.push({ kind: 'statusItem', ...change });
  }
  const same = (x: readonly string[], y: readonly string[]) => x.join() === y.join();
  if (
    !same(
      fullOrder(sidebarViews, a.activityBar.order),
      fullOrder(sidebarViews, b.activityBar.order),
    )
  ) {
    changes.push({ kind: 'order', list: 'activityBar' });
  }
  if (
    !same(fullOrder(bottomViews, a.bottomTabs.order), fullOrder(bottomViews, b.bottomTabs.order))
  ) {
    changes.push({ kind: 'order', list: 'bottomTabs' });
  }
  for (const command of after.toolbar) {
    if (!before.toolbar.includes(command)) changes.push({ kind: 'toolbarAdd', command });
  }
  for (const command of before.toolbar) {
    if (!after.toolbar.includes(command)) changes.push({ kind: 'toolbarRemove', command });
  }
  const kept = (list: readonly string[], other: readonly string[]) =>
    list.filter((id) => other.includes(id));
  if (!same(kept(before.toolbar, after.toolbar), kept(after.toolbar, before.toolbar))) {
    changes.push({ kind: 'toolbarOrder' });
  }
  if (before.sidebarView !== after.sidebarView) {
    changes.push({ kind: 'view', area: 'sidebar', view: after.sidebarView });
  }
  if (before.bottomView !== after.bottomView) {
    changes.push({ kind: 'view', area: 'bottom', view: after.bottomView });
  }
  return changes;
}

/**
 * Finds the JSON object in a model answer: the whole text, a ```json block,
 * or the outermost braces. Returns null if none parses.
 */
export function extractJson(answer: string): unknown {
  const candidates = [answer.trim()];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(answer);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(answer.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // try the next one
    }
  }
  return null;
}
