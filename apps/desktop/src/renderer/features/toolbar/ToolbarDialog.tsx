import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, SquareTerminal, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MAX_TOOLBAR_ITEMS, defaultToolbar } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { closeModal } from '../../stores/modals';
import { useSettingsStore } from '../../stores/settings';
import { useCommandStore } from '../commands';
import type { Command } from '../commands';
import { addToToolbar, moveInToolbar, removeFromToolbar } from './actions';
import styles from './ToolbarDialog.module.css';

function label(command: Command): string {
  const category = command.category?.();
  return category ? `${category}: ${command.title()}` : command.title();
}

/** Choose which commands appear as buttons in the title bar, and in which order. */
export function ToolbarDialog() {
  const { t } = useTranslation();
  const items = useSettingsStore((state) => state.settings.toolbar);
  const update = useSettingsStore((state) => state.update);
  const commands = useCommandStore((state) => state.commands);
  const [query, setQuery] = useState('');
  const searchId = useId();

  const current = items
    .map((id) => commands.get(id))
    .filter((command): command is Command => command !== undefined);
  const needle = query.trim().toLowerCase();
  const available = [...commands.values()]
    .filter((command) => command.showInPalette !== false && !items.includes(command.id))
    .filter((command) => !needle || label(command).toLowerCase().includes(needle))
    .sort((a, b) => label(a).localeCompare(label(b)));
  const full = items.length >= MAX_TOOLBAR_ITEMS;

  return (
    <Modal title={t('toolbar.dialogTitle')} onClose={closeModal} size="lg">
      <p className={styles['intro']}>{t('toolbar.intro')}</p>
      <div className={styles['columns']}>
        <section aria-labelledby={`${searchId}-current`}>
          <h3 id={`${searchId}-current`} className={styles['heading']}>
            {t('toolbar.current')}
          </h3>
          {current.length === 0 ? (
            <p className={styles['muted']}>{t('toolbar.empty')}</p>
          ) : (
            <ol className={styles['list']} aria-label={t('toolbar.current')}>
              {current.map((command, index) => {
                const Icon = command.icon ?? SquareTerminal;
                return (
                  <li key={command.id} className={styles['row']}>
                    <Icon size={14} aria-hidden="true" />
                    <span className={styles['title']}>{label(command)}</span>
                    <IconButton
                      size="sm"
                      icon={ArrowUp}
                      label={t('toolbar.moveEarlier', { name: command.title() })}
                      disabled={index === 0}
                      onClick={() => {
                        moveInToolbar(command.id, -1);
                      }}
                    />
                    <IconButton
                      size="sm"
                      icon={ArrowDown}
                      label={t('toolbar.moveLater', { name: command.title() })}
                      disabled={index === current.length - 1}
                      onClick={() => {
                        moveInToolbar(command.id, 1);
                      }}
                    />
                    <IconButton
                      size="sm"
                      icon={X}
                      label={t('toolbar.removeName', { name: command.title() })}
                      onClick={() => {
                        removeFromToolbar(command.id);
                      }}
                    />
                  </li>
                );
              })}
            </ol>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              void update({ toolbar: [...defaultToolbar] });
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            {t('toolbar.reset')}
          </Button>
        </section>
        <section aria-labelledby={`${searchId}-add`}>
          <h3 id={`${searchId}-add`} className={styles['heading']}>
            {t('toolbar.add')}
          </h3>
          <label htmlFor={searchId} className="visually-hidden">
            {t('toolbar.search')}
          </label>
          <input
            id={searchId}
            className={styles['search']}
            type="search"
            placeholder={t('toolbar.search')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          {full && (
            <p className={styles['muted']}>{t('toolbar.full', { max: MAX_TOOLBAR_ITEMS })}</p>
          )}
          <ul className={styles['list']} aria-label={t('toolbar.add')}>
            {available.map((command) => {
              const Icon = command.icon ?? SquareTerminal;
              return (
                <li key={command.id} className={styles['row']}>
                  <Icon size={14} aria-hidden="true" />
                  <span className={styles['title']}>{label(command)}</span>
                  <IconButton
                    size="sm"
                    icon={Plus}
                    label={t('toolbar.addName', { name: command.title() })}
                    disabled={full}
                    onClick={() => {
                      addToToolbar(command.id);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
