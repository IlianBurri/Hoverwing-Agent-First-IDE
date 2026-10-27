import { Container, Cpu, Files, GitBranch, Monitor, Moon, Plug, Search, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { orderedVisible, sidebarViews } from '@kestrel/shared';
import type { SidebarView, ThemePreference } from '@kestrel/shared';
import { IconButton } from '../components/IconButton';
import { openLayoutMenu } from '../features/layout';
import { setPanelOpen, useLayoutStore } from '../stores/layout';
import { useSettingsStore } from '../stores/settings';
import { nextThemePreference } from '../stores/theme';
import styles from './ActivityBar.module.css';

export const viewIcons: Record<SidebarView, LucideIcon> = {
  files: Files,
  search: Search,
  git: GitBranch,
  docker: Container,
  mcp: Plug,
  models: Cpu,
};

const themeIcons: Record<ThemePreference, LucideIcon> = {
  dark: Moon,
  light: Sun,
  system: Monitor,
};

export function ActivityBar() {
  const { t } = useTranslation();
  const sidebarCollapsed = useLayoutStore((state) => state.collapsed.sidebar);
  const layout = useSettingsStore((state) => state.settings.layout);
  const theme = useSettingsStore((state) => state.settings.theme);
  const update = useSettingsStore((state) => state.update);
  const activityBar = useSettingsStore((state) => state.settings.workbench.activityBar);
  const sidebarSide = useSettingsStore((state) => state.settings.workbench.sidebarSide);
  const views = orderedVisible(sidebarViews, activityBar.order, activityBar.hidden).map((id) => ({
    id,
    icon: viewIcons[id],
  }));

  function selectView(view: SidebarView) {
    if (!sidebarCollapsed && layout.sidebarView === view) {
      setPanelOpen('sidebar', false);
      return;
    }
    setPanelOpen('sidebar', true);
    if (layout.sidebarView !== view) void update({ layout: { ...layout, sidebarView: view } });
  }

  return (
    <nav
      className={styles['root']}
      data-side={sidebarSide}
      aria-label={t('activity.label')}
      onContextMenu={openLayoutMenu}
    >
      <div className={styles['group']}>
        {views.map((view) => (
          <IconButton
            key={view.id}
            icon={view.icon}
            label={t(`activity.${view.id}`)}
            pressed={!sidebarCollapsed && layout.sidebarView === view.id}
            className={styles['item']}
            onClick={() => {
              selectView(view.id);
            }}
          />
        ))}
      </div>
      <div className={styles['group']}>
        <IconButton
          icon={themeIcons[theme]}
          label={t('theme.cycle', { current: t(`theme.${theme}`) })}
          onClick={() => {
            void update({ theme: nextThemePreference(theme) });
          }}
        />
      </div>
    </nav>
  );
}
