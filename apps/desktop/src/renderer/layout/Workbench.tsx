import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { Layout, PanelSize } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';
import { AgentPanel } from '../features/agent';
import { EditorArea } from '../features/editor';
import { registerPanel, useLayoutStore, usableLayout } from '../stores/layout';
import type { CollapsiblePanel } from '../stores/layout';
import { useSettingsStore } from '../stores/settings';
import { BottomPanel } from './BottomPanel';
import { Sidebar } from './Sidebar';
import styles from './Workbench.module.css';

const MAIN_GROUP = 'main';
const CENTER_GROUP = 'center';
const mainPanels = ['sidebar', 'center', 'agent'] as const;
const centerPanels = ['editor', 'bottom'] as const;

/** Debounce for writing panel sizes while the user drags a separator. */
const SAVE_DELAY_MS = 400;

/**
 * Hides the content of a collapsed panel from layout, focus and screen
 * readers while keeping it mounted (so state such as terminals survives).
 */
function PanelContent({ panel, children }: { panel: CollapsiblePanel; children: ReactNode }) {
  const collapsed = useLayoutStore((state) => state.collapsed[panel]);
  return (
    <div className={styles['content']} hidden={collapsed}>
      {children}
    </div>
  );
}

function trackCollapse(panel: CollapsiblePanel) {
  return (size: PanelSize) => {
    useLayoutStore.getState().setCollapsed(panel, size.asPercentage === 0);
  };
}

/**
 * The resizable area between activity bar and status bar:
 * sidebar | (editor / bottom panel) | agent panel.
 */
export function Workbench() {
  const { t } = useTranslation();
  const saveTimers = useRef(new Map<string, number>());
  // Read once: groups take their initial layout on mount only.
  const storedGroups = useMemo(() => useSettingsStore.getState().settings.layout.groups, []);

  function saveLayout(groupId: string, layout: Layout) {
    const timers = saveTimers.current;
    window.clearTimeout(timers.get(groupId));
    timers.set(
      groupId,
      window.setTimeout(() => {
        const { settings, update } = useSettingsStore.getState();
        void update({
          layout: { ...settings.layout, groups: { ...settings.layout.groups, [groupId]: layout } },
        });
      }, SAVE_DELAY_MS),
    );
  }

  const separator = (
    <Separator className={styles['separator']} aria-label={t('layout.resizeHandle')} />
  );

  return (
    <Group
      id={MAIN_GROUP}
      orientation="horizontal"
      className={styles['group']}
      defaultLayout={usableLayout(storedGroups[MAIN_GROUP], mainPanels)}
      onLayoutChanged={(layout) => {
        saveLayout(MAIN_GROUP, layout);
      }}
    >
      <Panel
        id="sidebar"
        defaultSize="20"
        minSize={180}
        collapsible
        collapsedSize={0}
        panelRef={(handle) => {
          registerPanel('sidebar', handle);
        }}
        onResize={trackCollapse('sidebar')}
      >
        <PanelContent panel="sidebar">
          <Sidebar />
        </PanelContent>
      </Panel>
      {separator}
      <Panel id="center" minSize={320}>
        <Group
          id={CENTER_GROUP}
          orientation="vertical"
          className={styles['group']}
          defaultLayout={usableLayout(storedGroups[CENTER_GROUP], centerPanels)}
          onLayoutChanged={(layout) => {
            saveLayout(CENTER_GROUP, layout);
          }}
        >
          <Panel id="editor" minSize={120}>
            <EditorArea />
          </Panel>
          {separator}
          <Panel
            id="bottom"
            defaultSize="30"
            minSize={100}
            collapsible
            collapsedSize={0}
            panelRef={(handle) => {
              registerPanel('bottom', handle);
            }}
            onResize={trackCollapse('bottom')}
          >
            <PanelContent panel="bottom">
              <BottomPanel />
            </PanelContent>
          </Panel>
        </Group>
      </Panel>
      {separator}
      <Panel
        id="agent"
        defaultSize="26"
        minSize={280}
        collapsible
        collapsedSize={0}
        panelRef={(handle) => {
          registerPanel('agent', handle);
        }}
        onResize={trackCollapse('agent')}
      >
        <PanelContent panel="agent">
          <AgentPanel />
        </PanelContent>
      </Panel>
    </Group>
  );
}
