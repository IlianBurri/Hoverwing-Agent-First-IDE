import { Bug, Eraser, Globe } from 'lucide-react';
import { i18next } from '../../i18n';
import { registerCommands } from '../commands';
import { activeBrowserTab, clearBrowserData, openBrowser } from './actions';

export function registerBrowserCommands(): () => void {
  const category = () => i18next.t('commands.category.browser');
  return registerCommands([
    {
      id: 'browser.open',
      category,
      title: () => i18next.t('browser.open'),
      icon: Globe,
      keybinding: 'Mod+Shift+O',
      run: () => openBrowser(),
    },
    {
      id: 'browser.devTools',
      category,
      title: () => i18next.t('browser.devTools'),
      icon: Bug,
      when: () => activeBrowserTab() !== null,
      run: async () => {
        const tabId = activeBrowserTab();
        if (tabId) await window.kestrel.invoke('browser:openDevTools', { tabId });
      },
    },
    {
      id: 'browser.clearData',
      category,
      title: () => i18next.t('browser.clearData'),
      icon: Eraser,
      run: clearBrowserData,
    },
  ]);
}
