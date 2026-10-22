import { PanelBottom, PanelLeft, PanelRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../components/IconButton';
import { Kbd } from '../components/Kbd';
import { KestrelMark } from '../components/KestrelMark';
import { runCommand, useKeybindingLabel } from '../features/commands';
import { togglePanel, useLayoutStore } from '../stores/layout';
import { useWorkspaceStore } from '../stores/workspace';
import styles from './TitleBar.module.css';

/**
 * Custom title bar. The whole bar drags the window; interactive elements opt
 * out. Native window controls are drawn by the OS on top (overlay).
 */
export function TitleBar() {
  const { t } = useTranslation();
  const collapsed = useLayoutStore((state) => state.collapsed);
  const paletteShortcut = useKeybindingLabel('workbench.commandPalette');
  const projectName = useWorkspaceStore((state) => state.info?.name);

  return (
    <header className={styles['root']}>
      <div className={styles['brand']}>
        <KestrelMark className={styles['mark']} />
        <span className={styles['name']}>Kestrel</span>
      </div>
      <div className={styles['center']}>
        <button
          type="button"
          className={styles['commandCenter']}
          aria-label={t('titleBar.searchCommands')}
          onClick={() => {
            void runCommand('workbench.commandPalette');
          }}
        >
          <Search size={14} aria-hidden="true" />
          <span className={styles['project']}>{projectName ?? t('titleBar.noProject')}</span>
          {paletteShortcut && <Kbd>{paletteShortcut}</Kbd>}
        </button>
      </div>
      <div className={styles['actions']}>
        <IconButton
          size="sm"
          icon={PanelLeft}
          label={t('layout.toggleSidebar')}
          pressed={!collapsed.sidebar}
          onClick={() => {
            togglePanel('sidebar');
          }}
        />
        <IconButton
          size="sm"
          icon={PanelBottom}
          label={t('layout.toggleBottom')}
          pressed={!collapsed.bottom}
          onClick={() => {
            togglePanel('bottom');
          }}
        />
        <IconButton
          size="sm"
          icon={PanelRight}
          label={t('layout.toggleAgent')}
          pressed={!collapsed.agent}
          onClick={() => {
            togglePanel('agent');
          }}
        />
      </div>
    </header>
  );
}
