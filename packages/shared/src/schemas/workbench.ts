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
