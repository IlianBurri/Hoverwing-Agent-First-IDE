import { useId } from 'react';
import { Bot, Play, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { StatusMessage } from '../../components/StatusMessage';
import { useAgentStore } from '../../stores/agent';
import { openModal } from '../../stores/modals';
import { useSandboxStore } from '../../stores/sandbox';
import { DockerHelp, SandboxBadge } from '../sandbox';
import { startAgent } from './actions';
import styles from './StartView.module.css';

/** Choose an agent and start it; explains login and shows start errors. */
export function StartView() {
  const { t } = useTranslation();
  const selectId = useId();
  const { configs, selectedAgentId, status } = useAgentStore();
  const starting = status.state === 'starting';
  const docker = useSandboxStore((state) => state.status?.docker ?? null);
  const selected = configs.find((config) => config.id === selectedAgentId) ?? null;
  const sandboxed = selected?.sandbox.enabled === true;

  return (
    <div className={styles['root']}>
      <Bot size={28} strokeWidth={1.5} aria-hidden="true" className={styles['icon']} />
      <p className={styles['title']}>{t('agent.startTitle')}</p>
      <p className={styles['text']}>{t('agent.startText')}</p>

      <div className={styles['row']}>
        <label htmlFor={selectId} className="visually-hidden">
          {t('agent.choose')}
        </label>
        <select
          id={selectId}
          className={styles['select']}
          value={selectedAgentId ?? ''}
          disabled={starting}
          onChange={(event) => {
            useAgentStore.setState({ selectedAgentId: event.target.value });
          }}
        >
          {configs.map((config) => (
            <option key={config.id} value={config.id}>
              {config.name}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          disabled={!selectedAgentId || starting}
          onClick={() => void startAgent()}
        >
          <Play size={14} aria-hidden="true" />
          {starting ? t('agent.starting') : t('agent.start')}
        </Button>
      </div>
      {selected && <SandboxBadge sandboxed={sandboxed} />}
      {sandboxed && docker && docker !== 'available' && <DockerHelp state={docker} />}
      <Button
        variant="ghost"
        onClick={() => {
          openModal({ id: 'agents' });
        }}
      >
        <Settings2 size={14} aria-hidden="true" />
        {t('agent.manage')}
      </Button>

      {starting && <p className={styles['hint']}>{t('agent.startingHint')}</p>}
      {status.state === 'error' && status.error && (
        <div className={styles['error']}>
          <StatusMessage kind={status.error === 'authRequired' ? 'warning' : 'error'}>
            {t(`agent.error.${status.error}`, { agent: status.agentName ?? '' })}
          </StatusMessage>
          {status.detail && <pre className={styles['detail']}>{status.detail}</pre>}
        </div>
      )}
      <p className={styles['privacy']}>{t('agent.privacyNote')}</p>
      <p className={styles['privacy']}>{t('agent.secretsNote')}</p>
    </div>
  );
}
