import { useState } from 'react';
import type { MouseEvent } from 'react';
import { ArrowLeft, ArrowRight, Settings2, SquareTerminal, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ContextMenu } from '../../components/ContextMenu';
import type { MenuEntry } from '../../components/ContextMenu';
import { IconButton } from '../../components/IconButton';
import { useAgentStore } from '../../stores/agent';
import { useEditorStore } from '../../stores/editor';
import { useGitStore } from '../../stores/git';
import { useSettingsStore } from '../../stores/settings';
import { useTrustStore } from '../../stores/trust';
import { useWorkspaceStore } from '../../stores/workspace';
import { isCommandEnabled, runCommand, useCommandStore, useKeybindingLabel } from '../commands';
import type { Command } from '../commands';
import { moveInToolbar, openToolbarDialog, removeFromToolbar } from './actions';
import styles from './Toolbar.module.css';

interface MenuState {
  x: number;
  y: number;
  /** The button that was right-clicked, or null for the empty bar. */
  commandId: string | null;
}

/**
 * Commands' `when` conditions read other stores and are not reactive, so the
 * toolbar re-renders when the state they usually depend on changes.
 */
function useAvailabilityInputs(): void {
  useWorkspaceStore((state) => state.info);
  useGitStore((state) => state.status);
  useGitStore((state) => state.busy);
  useTrustStore((state) => state.trusted);
  useAgentStore((state) => state.slots);
  useAgentStore((state) => state.activeSlotId);
  useEditorStore((state) => state.active);
}

function ToolbarButton({
  command,
  onContextMenu,
}: {
  command: Command;
  onContextMenu: (event: MouseEvent, id: string) => void;
}) {
  const shortcut = useKeybindingLabel(command.id);
  const title = command.title();
  return (
    <IconButton
      size="sm"
      icon={command.icon ?? SquareTerminal}
      label={shortcut ? `${title} (${shortcut})` : title}
      disabled={!isCommandEnabled(command)}
      data-command={command.id}
      onClick={() => void runCommand(command.id)}
      onContextMenu={(event) => {
        onContextMenu(event, command.id);
      }}
    />
  );
}

/** User-configurable command buttons in the title bar (settings.toolbar). */
export function Toolbar() {
  const { t } = useTranslation();
  useAvailabilityInputs();
  const items = useSettingsStore((state) => state.settings.toolbar);
  const commands = useCommandStore((state) => state.commands);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Commands of features that are not registered (yet) are skipped.
  const shown = items
    .map((id) => commands.get(id))
    .filter((command): command is Command => command !== undefined);

  const openMenu = (event: MouseEvent, commandId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, commandId });
  };

  const entries: MenuEntry[] = [];
  if (menu?.commandId) {
    const id = menu.commandId;
    const index = items.indexOf(id);
    if (index > 0) {
      entries.push({
        id: 'left',
        label: t('toolbar.moveLeft'),
        icon: ArrowLeft,
        onSelect: () => {
          moveInToolbar(id, -1);
        },
      });
    }
    if (index < items.length - 1) {
      entries.push({
        id: 'right',
        label: t('toolbar.moveRight'),
        icon: ArrowRight,
        onSelect: () => {
          moveInToolbar(id, 1);
        },
      });
    }
    entries.push(
      {
        id: 'remove',
        label: t('toolbar.remove'),
        icon: X,
        onSelect: () => {
          removeFromToolbar(id);
        },
      },
      'separator',
    );
  }
  entries.push({
    id: 'customize',
    label: t('toolbar.customize'),
    icon: Settings2,
    onSelect: openToolbarDialog,
  });

  return (
    <div
      role="toolbar"
      aria-label={t('toolbar.label')}
      className={styles['root']}
      onContextMenu={(event) => {
        openMenu(event, null);
      }}
    >
      {shown.map((command) => (
        <ToolbarButton key={command.id} command={command} onContextMenu={openMenu} />
      ))}
      <IconButton
        size="sm"
        icon={Settings2}
        label={t('toolbar.customize')}
        className={styles['customize']}
        onClick={openToolbarDialog}
      />
      {menu && (
        <ContextMenu
          label={t('toolbar.menuLabel')}
          x={menu.x}
          y={menu.y}
          entries={entries}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}
