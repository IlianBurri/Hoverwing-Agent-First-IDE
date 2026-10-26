import { Command as Cmdk } from 'cmdk';
import { useTranslation } from 'react-i18next';
import { Kbd } from '../../components/Kbd';
import { isCommandEnabled, runCommand, useCommandStore } from './registry';
import type { Command } from './registry';
import { useKeybindingLabel } from './useKeybindingLabel';
import styles from './CommandPalette.module.css';
import { useOverlay } from '../../stores/overlays';

function PaletteItem({ command, onRun }: { command: Command; onRun: (id: string) => void }) {
  const shortcut = useKeybindingLabel(command.id);
  const Icon = command.icon;
  const category = command.category?.();
  const title = command.title();
  return (
    <Cmdk.Item
      value={command.id}
      keywords={[title, category ?? '']}
      className={styles['item']}
      onSelect={() => {
        onRun(command.id);
      }}
    >
      <span className={styles['icon']}>{Icon && <Icon size={16} aria-hidden="true" />}</span>
      <span className={styles['label']}>
        {category && <span className={styles['category']}>{category}: </span>}
        {title}
      </span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </Cmdk.Item>
  );
}

/** Ctrl/Cmd+K: search and run every registered command. */
export function CommandPalette() {
  const { t } = useTranslation();
  const open = useCommandStore((state) => state.paletteOpen);
  const setOpen = useCommandStore((state) => state.setPaletteOpen);
  useOverlay(open);
  const commands = useCommandStore((state) => state.commands);
  const recentIds = useCommandStore((state) => state.recent);

  // Only compute the list while open; `when` checks read live state.
  const available = open
    ? [...commands.values()].filter(
        (command) => command.showInPalette !== false && isCommandEnabled(command),
      )
    : [];
  const recent = recentIds
    .map((id) => available.find((command) => command.id === id))
    .filter((command): command is Command => command !== undefined);
  const others = available
    .filter((command) => !recentIds.includes(command.id))
    .sort((a, b) => a.title().localeCompare(b.title()));

  function onRun(id: string) {
    setOpen(false);
    // Let the dialog close and return focus before the command moves it.
    window.setTimeout(() => void runCommand(id), 0);
  }

  return (
    <Cmdk.Dialog
      open={open}
      onOpenChange={setOpen}
      label={t('palette.label')}
      loop
      vimBindings={false}
      overlayClassName={styles['overlay'] ?? ''}
      contentClassName={styles['content'] ?? ''}
      filter={(value, search, keywords) => {
        const haystack = [value, ...(keywords ?? [])].join(' ').toLowerCase();
        return search
          .toLowerCase()
          .split(/\s+/)
          .every((word) => haystack.includes(word))
          ? 1
          : 0;
      }}
    >
      <Cmdk.Input className={styles['input']} placeholder={t('palette.placeholder')} />
      <Cmdk.List className={styles['list']}>
        <Cmdk.Empty className={styles['empty']}>{t('palette.empty')}</Cmdk.Empty>
        {recent.length > 0 && (
          <Cmdk.Group heading={t('palette.recent')} className={styles['group']}>
            {recent.map((command) => (
              <PaletteItem key={command.id} command={command} onRun={onRun} />
            ))}
          </Cmdk.Group>
        )}
        <Cmdk.Group heading={t('palette.all')} className={styles['group']}>
          {others.map((command) => (
            <PaletteItem key={command.id} command={command} onRun={onRun} />
          ))}
        </Cmdk.Group>
      </Cmdk.List>
    </Cmdk.Dialog>
  );
}
