import { Plus, SquareTerminal, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { useTerminalStore } from '../../stores/terminal';
import { useKeybindingLabel } from '../commands';
import { createTerminal, killTerminal } from './actions';
import { TerminalInstance } from './TerminalInstance';
import styles from './TerminalView.module.css';

export function TerminalView() {
  const { t } = useTranslation();
  const sessions = useTerminalStore((state) => state.sessions);
  const active = useTerminalStore((state) => state.active);
  const shortcut = useKeybindingLabel('terminal.new');

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={SquareTerminal}
        title={t('bottom.terminalEmptyTitle')}
        description={t('bottom.terminalEmptyText')}
      >
        <Button variant="primary" onClick={() => void createTerminal()}>
          {t('terminal.new')}
          {shortcut && <span className={styles['shortcut']}>{shortcut}</span>}
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className={styles['root']}>
      <div className={styles['terminals']}>
        {sessions.map((session) => (
          <TerminalInstance key={session.id} id={session.id} visible={session.id === active} />
        ))}
      </div>
      <div className={styles['sidebar']}>
        <div className={styles['toolbar']}>
          <IconButton
            size="sm"
            icon={Plus}
            label={t('terminal.new')}
            onClick={() => void createTerminal()}
          />
          {active && (
            <IconButton
              size="sm"
              icon={Trash2}
              label={t('terminal.kill')}
              onClick={() => void killTerminal(active)}
            />
          )}
        </div>
        <div
          role="tablist"
          aria-label={t('terminal.sessions')}
          aria-orientation="vertical"
          className={styles['list']}
        >
          {sessions.map((session, index) => (
            <button
              key={session.id}
              type="button"
              role="tab"
              aria-selected={session.id === active}
              title={session.cwd}
              className={styles['session']}
              onClick={() => {
                useTerminalStore.setState({ active: session.id });
              }}
            >
              <SquareTerminal size={14} aria-hidden="true" />
              <span>
                {index + 1}: {session.title}
              </span>
              {session.exitCode !== null && (
                <span className={styles['exited']}>{t('terminal.ended')}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
