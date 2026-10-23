import { useEffect, useId, useState } from 'react';
import type { SubmitEvent } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentConfig, AgentConfigView } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { notifyError } from '../../lib/errors';
import { useAgentStore } from '../../stores/agent';
import { confirm } from '../../stores/dialogs';
import { closeModal } from '../../stores/modals';
import { notify } from '../../stores/toasts';
import { loadAgentConfigs } from './actions';
import styles from './AgentsDialog.module.css';

function newId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'agent';
  return `${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

const emptyConfig = (): AgentConfig => ({
  id: newId('agent'),
  name: '',
  command: '',
  args: [],
  env: [],
  reviewChanges: true,
});

/** Add, edit and remove agents (name, command, arguments, secret variables). */
export function AgentsDialog() {
  const { t } = useTranslation();
  const configs = useAgentStore((state) => state.configs);
  const [selected, setSelected] = useState<string | null>(configs[0]?.id ?? null);
  const current = configs.find((config) => config.id === selected) ?? null;
  const [draft, setDraft] = useState<AgentConfig>(current ?? emptyConfig());
  const [argsText, setArgsText] = useState((current?.args ?? []).join('\n'));
  const [newVariable, setNewVariable] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const ids = {
    name: useId(),
    command: useId(),
    args: useId(),
    variable: useId(),
    review: useId(),
  };

  function select(config: AgentConfigView | null) {
    setSelected(config?.id ?? null);
    const next = config ?? emptyConfig();
    setDraft(next);
    setArgsText(next.args.join('\n'));
    setValues({});
  }

  useEffect(() => {
    void loadAgentConfigs();
  }, []);

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const config: AgentConfig = {
      ...draft,
      name: draft.name.trim(),
      command: draft.command.trim(),
      args: argsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    };
    const result = await window.kestrel.invoke('agent:saveConfig', config);
    if (!result.ok) {
      notifyError(t('agents.save'), result.error);
      return;
    }
    for (const [name, value] of Object.entries(values)) {
      if (value === '') continue;
      const stored = await window.kestrel.invoke('agent:setEnv', {
        agentId: config.id,
        name,
        value,
      });
      if (!stored.ok) notifyError(t('agents.save'), stored.error);
    }
    setValues({});
    await loadAgentConfigs();
    setSelected(config.id);
    notify('success', t('agents.saved', { name: config.name }));
  }

  async function remove() {
    if (!current) return;
    const confirmed = await confirm({
      title: t('agents.deleteTitle', { name: current.name }),
      message: t('agents.deleteMessage'),
      confirmLabel: t('agents.delete'),
      danger: true,
    });
    if (!confirmed) return;
    await window.kestrel.invoke('agent:deleteConfig', { id: current.id });
    await loadAgentConfigs();
    select(null);
  }

  async function clearValue(name: string) {
    await window.kestrel.invoke('agent:setEnv', { agentId: draft.id, name, value: null });
    await loadAgentConfigs();
  }

  const valid = draft.name.trim() !== '' && draft.command.trim() !== '';

  return (
    <Modal title={t('agents.title')} onClose={closeModal} size="lg">
      <div className={styles['layout']}>
        <nav aria-label={t('agents.list')} className={styles['list']}>
          {configs.map((config) => (
            <button
              key={config.id}
              type="button"
              aria-current={config.id === selected}
              className={styles['item']}
              onClick={() => {
                select(config);
              }}
            >
              {config.name}
            </button>
          ))}
          <Button
            variant="ghost"
            onClick={() => {
              select(null);
            }}
          >
            <Plus size={14} aria-hidden="true" />
            {t('agents.add')}
          </Button>
        </nav>

        <form className={styles['form']} onSubmit={(event) => void save(event)}>
          <label htmlFor={ids.name}>{t('agents.name')}</label>
          <input
            id={ids.name}
            value={draft.name}
            onChange={(event) => {
              setDraft({ ...draft, name: event.target.value });
            }}
          />
          <label htmlFor={ids.command}>{t('agents.command')}</label>
          <input
            id={ids.command}
            value={draft.command}
            spellCheck={false}
            placeholder="npx"
            onChange={(event) => {
              setDraft({ ...draft, command: event.target.value });
            }}
          />
          <label htmlFor={ids.args}>{t('agents.args')}</label>
          <textarea
            id={ids.args}
            rows={3}
            value={argsText}
            spellCheck={false}
            onChange={(event) => {
              setArgsText(event.target.value);
            }}
          />
          <p className={styles['hint']}>{t('agents.argsHint')}</p>

          <span className={styles['label']}>{t('agents.env')}</span>
          <div className={styles['env']}>
            {draft.env.length === 0 && <p className={styles['hint']}>{t('agents.envEmpty')}</p>}
            {draft.env.map((name) => {
              const isSet = current?.envSet[name] === true;
              return (
                <div key={name} className={styles['envRow']}>
                  <KeyRound size={14} aria-hidden="true" />
                  <code>{name}</code>
                  <input
                    type="password"
                    aria-label={t('agents.envValue', { name })}
                    placeholder={isSet ? t('agents.envIsSet') : t('agents.envNotSet')}
                    value={values[name] ?? ''}
                    autoComplete="off"
                    onChange={(event) => {
                      setValues({ ...values, [name]: event.target.value });
                    }}
                  />
                  {isSet && (
                    <Button variant="ghost" onClick={() => void clearValue(name)}>
                      {t('agents.envClear')}
                    </Button>
                  )}
                  <IconButton
                    size="sm"
                    icon={Trash2}
                    label={t('agents.envRemove', { name })}
                    onClick={() => {
                      setDraft({ ...draft, env: draft.env.filter((entry) => entry !== name) });
                    }}
                  />
                </div>
              );
            })}
            <div className={styles['envRow']}>
              <label htmlFor={ids.variable} className="visually-hidden">
                {t('agents.envNew')}
              </label>
              <input
                id={ids.variable}
                value={newVariable}
                placeholder="ANTHROPIC_API_KEY"
                spellCheck={false}
                onChange={(event) => {
                  setNewVariable(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
                }}
              />
              <Button
                disabled={
                  !/^[A-Z_][A-Z0-9_]*$/.test(newVariable) || draft.env.includes(newVariable)
                }
                onClick={() => {
                  setDraft({ ...draft, env: [...draft.env, newVariable] });
                  setNewVariable('');
                }}
              >
                {t('agents.envAdd')}
              </Button>
            </div>
            <p className={styles['hint']}>{t('agents.envHint')}</p>
          </div>

          <span className={styles['label']}>{t('agents.review')}</span>
          <label htmlFor={ids.review} className={styles['checkbox']}>
            <input
              id={ids.review}
              type="checkbox"
              checked={draft.reviewChanges}
              onChange={(event) => {
                setDraft({ ...draft, reviewChanges: event.target.checked });
              }}
            />
            {t('agents.reviewLabel')}
          </label>

          <div className={styles['actions']}>
            {current && (
              <Button variant="ghost" className={styles['delete']} onClick={() => void remove()}>
                {t('agents.delete')}
              </Button>
            )}
            <Button type="submit" variant="primary" disabled={!valid}>
              {t('agents.save')}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
