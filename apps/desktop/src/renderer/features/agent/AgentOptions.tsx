import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentOption, AgentOptionChoice, AgentUsage } from '@kestrel/shared';
import { useActiveSlot } from '../../stores/agent';
import { setAgentOption } from './actions';
import styles from './AgentOptions.module.css';

/** Order in the bar: the usual pickers first, the rest after. */
const ORDER: Record<AgentOption['category'], number> = { model: 0, effort: 1, mode: 2, other: 3 };

function groups(choices: readonly AgentOptionChoice[]): [string | null, AgentOptionChoice[]][] {
  const result = new Map<string | null, AgentOptionChoice[]>();
  for (const choice of choices)
    result.set(choice.group, [...(result.get(choice.group) ?? []), choice]);
  return [...result.entries()];
}

function OptionControl({ option, disabled }: { option: AgentOption; disabled: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const slot = useActiveSlot();
  const label = option.category === 'other' ? option.name : t(`agent.options.${option.category}`);

  if (typeof option.value === 'boolean') {
    return (
      <label className={styles['toggle']} title={option.description ?? undefined}>
        <input
          type="checkbox"
          checked={option.value}
          disabled={disabled}
          onChange={(event) => void setAgentOption(slot.id, option.id, event.target.checked)}
        />
        {label}
      </label>
    );
  }
  const current = option.value;
  // The agent may start in a value it does not list (e.g. an unsafe mode): show it anyway.
  const listed = option.choices.some((choice) => choice.value === current);
  return (
    <span className={styles['field']}>
      <label htmlFor={id} className={styles['label']}>
        {label}
      </label>
      <select
        id={id}
        className={styles['select']}
        value={current}
        disabled={disabled}
        title={option.description ?? undefined}
        onChange={(event) => void setAgentOption(slot.id, option.id, event.target.value)}
      >
        {!listed && <option value={current}>{current}</option>}
        {groups(option.choices).map(([group, choices]) => {
          const items = choices.map((choice) => (
            <option key={choice.value} value={choice.value} title={choice.description ?? undefined}>
              {choice.name}
            </option>
          ));
          return group === null ? (
            items
          ) : (
            <optgroup key={group} label={group}>
              {items}
            </optgroup>
          );
        })}
      </select>
    </span>
  );
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${String(Math.round(value / 100_000) / 10)}M`;
  if (value >= 1000) return `${String(Math.round(value / 1000))}k`;
  return String(value);
}

function ContextMeter({ usage }: { usage: AgentUsage }) {
  const { t } = useTranslation();
  const used = formatTokens(usage.used);
  const size = formatTokens(usage.size);
  return (
    <span className={styles['context']} title={t('agent.options.contextHint')}>
      <meter
        className={styles['meter']}
        min={0}
        max={usage.size}
        value={usage.used}
        low={usage.size * 0.7}
        high={usage.size * 0.9}
        optimum={0}
        aria-label={t('agent.options.context')}
      />
      {t('agent.options.contextValue', { used, size })}
    </span>
  );
}

/** Model, effort, mode … of the tab's session, as far as the agent offers them. */
export function AgentOptions() {
  const { t } = useTranslation();
  const { status } = useActiveSlot();
  if (status.options.length === 0 && status.usage === null) return null;
  const options = [...status.options].sort((a, b) => ORDER[a.category] - ORDER[b.category]);
  return (
    <div className={styles['root']} role="group" aria-label={t('agent.options.label')}>
      {options.map((option) => (
        <OptionControl key={option.id} option={option} disabled={status.state !== 'ready'} />
      ))}
      {status.usage && <ContextMeter usage={status.usage} />}
    </div>
  );
}
