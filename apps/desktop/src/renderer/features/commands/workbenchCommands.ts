import {
  Command as CommandIcon,
  Files,
  Languages,
  Monitor,
  Moon,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Search,
  SquareTerminal,
  Sun,
} from 'lucide-react';
import type { ParseKeys } from 'i18next';
import type { BottomView, Language, SidebarView, ThemePreference } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { setPanelOpen, togglePanel } from '../../stores/layout';
import { useSettingsStore } from '../../stores/settings';
import { requestSearchFocus } from '../../stores/search';
import { nextThemePreference } from '../../stores/theme';
import type { Command } from './registry';
import { registerCommands, useCommandStore } from './registry';

/** Defers translation until render time, so language switches apply. */
const t =
  (key: ParseKeys): (() => string) =>
  () =>
    i18next.t(key);

function showSidebarView(view: SidebarView) {
  const { settings, update } = useSettingsStore.getState();
  setPanelOpen('sidebar', true);
  void update({ layout: { ...settings.layout, sidebarView: view } });
}

function showBottomView(view: BottomView) {
  const { settings, update } = useSettingsStore.getState();
  setPanelOpen('bottom', true);
  void update({ layout: { ...settings.layout, bottomView: view } });
}

function setTheme(theme: ThemePreference) {
  void useSettingsStore.getState().update({ theme });
}

function setLanguage(language: Language | null) {
  void useSettingsStore.getState().update({ language });
}

const themeIcons = { dark: Moon, light: Sun, system: Monitor } as const;

/** Commands that belong to the workbench itself (layout, theme, language). */
export function registerWorkbenchCommands(): () => void {
  const view = t('commands.category.view');
  const preferences = t('commands.category.preferences');

  const commands: Command[] = [
    {
      id: 'workbench.commandPalette',
      title: t('commands.palette'),
      icon: CommandIcon,
      keybinding: 'Mod+K',
      showInPalette: false,
      run: () => {
        const { paletteOpen, setPaletteOpen } = useCommandStore.getState();
        setPaletteOpen(!paletteOpen);
      },
    },
    {
      id: 'view.toggleSidebar',
      category: view,
      title: t('layout.toggleSidebar'),
      icon: PanelLeft,
      keybinding: 'Mod+B',
      run: () => {
        togglePanel('sidebar');
      },
    },
    {
      id: 'view.toggleBottom',
      category: view,
      title: t('layout.toggleBottom'),
      icon: PanelBottom,
      keybinding: 'Mod+J',
      run: () => {
        togglePanel('bottom');
      },
    },
    {
      id: 'view.toggleAgent',
      category: view,
      title: t('layout.toggleAgent'),
      icon: PanelRight,
      keybinding: 'Mod+Alt+B',
      run: () => {
        togglePanel('agent');
      },
    },
    {
      id: 'view.showFiles',
      category: view,
      title: t('commands.showFiles'),
      icon: Files,
      keybinding: 'Mod+Shift+E',
      run: () => {
        showSidebarView('files');
      },
    },
    {
      id: 'view.showSearch',
      category: view,
      title: t('commands.showSearch'),
      icon: Search,
      keybinding: 'Mod+Shift+F',
      run: () => {
        showSidebarView('search');
        requestSearchFocus();
      },
    },
    {
      id: 'view.showTerminal',
      category: view,
      title: t('commands.showTerminal'),
      icon: SquareTerminal,
      keybinding: 'Ctrl+`',
      run: () => {
        showBottomView('terminal');
      },
    },
    {
      id: 'preferences.cycleTheme',
      category: preferences,
      title: t('commands.cycleTheme'),
      run: () => {
        setTheme(nextThemePreference(useSettingsStore.getState().settings.theme));
      },
    },
    ...(['dark', 'light', 'system'] as const).map((theme): Command => ({
      id: `preferences.theme.${theme}`,
      category: preferences,
      title: () => i18next.t('commands.setTheme', { theme: i18next.t(`theme.${theme}`) }),
      icon: themeIcons[theme],
      run: () => {
        setTheme(theme);
      },
    })),
    ...(
      [
        ['de', 'Deutsch'],
        ['en', 'English'],
      ] as const
    ).map(([language, name]): Command => ({
      id: `preferences.language.${language}`,
      category: preferences,
      title: () => i18next.t('commands.setLanguage', { language: name }),
      icon: Languages,
      run: () => {
        setLanguage(language);
      },
    })),
    {
      id: 'preferences.language.system',
      category: preferences,
      title: t('commands.languageSystem'),
      icon: Languages,
      run: () => {
        setLanguage(null);
      },
    },
  ];

  return registerCommands(commands);
}
