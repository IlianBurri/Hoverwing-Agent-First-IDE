import { Container, Cpu, Files, Monitor, Moon, Plug, Search, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SidebarView, ThemePreference } from '@kestrel/shared';
import { IconButton } from '../components/IconButton';
import { setPanelOpen, useLayoutStore } from '../stores/layout';
import { useSettingsStore } from '../stores/settings';
import { nextThemePreference } from '../stores/theme';
import styles from './ActivityBar.module.css';

const views: readonly { id: SidebarView; icon: LucideIcon }[] = [
  { id: 'files', icon: Files },
  { id: 'search', icon: Search },
  { id: 'docker', icon: Container },
  { id: 'mcp', icon: Plug },
  { id: 'models', icon: Cpu },
];

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

  function selectView(view: SidebarView) {
    if (!sidebarCollapsed && layout.sidebarView === view) {
      setPanelOpen('sidebar', false);
      return;
    }
    setPanelOpen('sidebar', true);
    if (layout.sidebarView !== view) void update({ layout: { ...layout, sidebarView: view } });
  }

  return (
    <nav className={styles['root']} aria-label={t('activity.label')}>
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
