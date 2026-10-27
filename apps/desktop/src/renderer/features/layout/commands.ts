import {
  ArrowLeftRight,
  LayoutTemplate,
  PanelBottomClose,
  PanelLeftClose,
  RotateCcw,
  Save,
} from 'lucide-react';
import type { LayoutProfile } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { registerCommands } from '../commands';
import {
  allProfiles,
  applyProfile,
  isBuiltinProfile,
  openLayoutDialog,
  resetLayout,
  saveCurrentAsProfile,
  updateWorkbench,
} from './actions';

const category = () => i18next.t('commands.category.view');
const otherSide = (side: 'left' | 'right') => (side === 'left' ? 'right' : 'left');

export function registerLayoutCommands(): () => void {
  return registerCommands([
    {
      id: 'layout.customize',
      category,
      title: () => i18next.t('layout.customize'),
      icon: LayoutTemplate,
      run: openLayoutDialog,
    },
    {
      id: 'layout.moveSidebar',
      category,
      title: () => i18next.t('layout.moveSidebar'),
      icon: ArrowLeftRight,
      run: () => {
        updateWorkbench((workbench) => ({
          ...workbench,
          sidebarSide: otherSide(workbench.sidebarSide),
        }));
      },
    },
    {
      id: 'layout.moveAgent',
      category,
      title: () => i18next.t('layout.moveAgent'),
      icon: ArrowLeftRight,
      run: () => {
        updateWorkbench((workbench) => ({
          ...workbench,
          agentSide: otherSide(workbench.agentSide),
        }));
      },
    },
    {
      id: 'layout.toggleActivityBar',
      category,
      title: () => i18next.t('layout.toggleActivityBar'),
      icon: PanelLeftClose,
      run: () => {
        updateWorkbench((workbench) => ({
          ...workbench,
          activityBar: { ...workbench.activityBar, visible: !workbench.activityBar.visible },
        }));
      },
    },
    {
      id: 'layout.toggleStatusBar',
      category,
      title: () => i18next.t('layout.toggleStatusBar'),
      icon: PanelBottomClose,
      run: () => {
        updateWorkbench((workbench) => ({
          ...workbench,
          statusBar: { ...workbench.statusBar, visible: !workbench.statusBar.visible },
        }));
      },
    },
    {
      id: 'layout.saveProfile',
      category,
      title: () => i18next.t('layout.saveProfile'),
      icon: Save,
      run: saveCurrentAsProfile,
    },
    {
      id: 'layout.reset',
      category,
      title: () => i18next.t('layout.reset'),
      icon: RotateCcw,
      run: resetLayout,
    },
  ]);
}

/** One command per profile ("Layout: Focus"), so profiles also fit the toolbar. */
export function registerProfileCommands(saved: readonly LayoutProfile[]): () => void {
  return registerCommands(
    allProfiles(saved).map((profile) => ({
      id: `layout.profile.${profile.id}`,
      category,
      // Shipped profiles are translated when shown (the language can change).
      title: () =>
        i18next.t('layout.useProfile', {
          name: isBuiltinProfile(profile.id)
            ? i18next.t(`layout.profile.${profile.id}` as 'layout.profile.standard')
            : profile.name,
        }),
      icon: LayoutTemplate,
      run: () => applyProfile(profile),
    })),
  );
}
