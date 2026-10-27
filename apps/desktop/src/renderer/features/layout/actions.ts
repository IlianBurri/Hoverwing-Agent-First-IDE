import type { MouseEvent } from 'react';
import { builtinProfiles, defaultWorkbench, layoutProfileSchema } from '@kestrel/shared';
import type { LayoutProfile, Workbench } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { confirm, prompt } from '../../stores/dialogs';
import { applyPanelState, useLayoutStore } from '../../stores/layout';
import { openModal } from '../../stores/modals';
import { useSettingsStore } from '../../stores/settings';
import { notify } from '../../stores/toasts';

const t = i18next.t.bind(i18next);

export function openLayoutDialog(): void {
  openModal({ id: 'layout' });
}

export function openLayoutAiDialog(): void {
  openModal({ id: 'layoutAi' });
}

/** Right-click on a bar: open the layout dialog (instead of a one-item menu). */
export function openLayoutMenu(event: MouseEvent): void {
  if (event.defaultPrevented) return;
  event.preventDefault();
  openLayoutDialog();
}

export function updateWorkbench(change: (workbench: Workbench) => Workbench): void {
  const { settings, update } = useSettingsStore.getState();
  void update({ workbench: change(settings.workbench) });
}

/** The profiles to offer: shipped ones (translated names) first, then the user's. */
export function allProfiles(saved: readonly LayoutProfile[]): LayoutProfile[] {
  return [
    ...builtinProfiles.map((profile) => ({
      ...profile,
      name: t(`layout.profile.${profile.id}` as 'layout.profile.standard'),
    })),
    ...saved,
  ];
}

export function isBuiltinProfile(id: string): boolean {
  return builtinProfiles.some((profile) => profile.id === id);
}

export async function applyProfile(profile: LayoutProfile): Promise<void> {
  const { settings, update } = useSettingsStore.getState();
  // Shipped profiles other than "Standard" only change what is open, not
  // the user's sides, bars and tabs.
  const panelsOnly = isBuiltinProfile(profile.id) && profile.id !== 'standard';
  const workbench = panelsOnly
    ? { ...settings.workbench, panels: profile.workbench.panels }
    : profile.workbench;
  await update({
    workbench,
    layout: {
      ...settings.layout,
      ...(profile.sidebarView ? { sidebarView: profile.sidebarView } : {}),
      ...(profile.bottomView ? { bottomView: profile.bottomView } : {}),
    },
  });
  // After a side change the panels are re-ordered first; open/close afterwards.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      applyPanelState(workbench.panels);
    });
  });
}

export async function resetLayout(): Promise<void> {
  const standard = builtinProfiles.find((profile) => profile.id === 'standard');
  await applyProfile({
    id: 'standard',
    name: '',
    workbench: standard?.workbench ?? defaultWorkbench,
  });
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'layout'
  );
}

/** Saves the current arrangement (incl. which panels are open) under a name. */
export async function saveCurrentAsProfile(): Promise<void> {
  const { settings, update } = useSettingsStore.getState();
  const name = await prompt({
    title: t('layout.saveProfile'),
    label: t('layout.profileName'),
    confirmLabel: t('layout.save'),
    validate: (value) => (value.trim() ? null : t('layout.profileNameMissing')),
  });
  if (name === null) return;
  const { collapsed } = useLayoutStore.getState();
  let id = `user-${slug(name.trim())}`;
  const taken = new Set(settings.layoutProfiles.map((profile) => profile.id));
  for (let n = 2; taken.has(id); n++) id = `user-${slug(name.trim())}-${String(n)}`;
  const profile = layoutProfileSchema.parse({
    id,
    name: name.trim().slice(0, 60),
    workbench: {
      ...settings.workbench,
      panels: { sidebar: !collapsed.sidebar, bottom: !collapsed.bottom, agent: !collapsed.agent },
    },
    sidebarView: settings.layout.sidebarView,
    bottomView: settings.layout.bottomView,
  });
  if (settings.layoutProfiles.length >= 20) {
    notify('warning', t('layout.tooManyProfiles'));
    return;
  }
  await update({ layoutProfiles: [...settings.layoutProfiles, profile] });
  notify('success', t('layout.profileSaved', { name: profile.name }));
}

export async function deleteProfile(profile: LayoutProfile): Promise<void> {
  const confirmed = await confirm({
    title: t('layout.deleteProfileTitle', { name: profile.name }),
    message: t('layout.deleteProfileMessage'),
    confirmLabel: t('layout.deleteProfile'),
    danger: true,
  });
  if (!confirmed) return;
  const { settings, update } = useSettingsStore.getState();
  await update({
    layoutProfiles: settings.layoutProfiles.filter((entry) => entry.id !== profile.id),
  });
}
