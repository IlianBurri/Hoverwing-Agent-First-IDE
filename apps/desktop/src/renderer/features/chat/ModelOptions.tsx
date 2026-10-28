import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultModelOptions, modelOptionsSchema, modelRefKey } from '@kestrel/shared';
import type { ModelOptions as Options, ModelRef } from '@kestrel/shared';
import { useSettingsStore } from '../../stores/settings';
import styles from './ModelOptions.module.css';

type Effort = NonNullable<Options['reasoningEffort']>;
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high'];

async function save(ref: ModelRef, patch: Partial<Options>): Promise<void> {
  const { settings, update } = useSettingsStore.getState();
  const key = modelRefKey(ref);
  const parsed = modelOptionsSchema.safeParse({
    ...(settings.chatModelOptions[key] ?? defaultModelOptions),
    ...patch,
  });
  if (!parsed.success) return;
  await update({ chatModelOptions: { ...settings.chatModelOptions, [key]: parsed.data } });
}

/** Empty = the provider's default; otherwise a number in range. */
function NumberField({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number | null) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const commit = () => {
    const trimmed = draft.trim();
    const number = Number(trimmed);
    if (trimmed === '') onCommit(null);
    else if (Number.isFinite(number) && number >= min && number <= max) onCommit(number);
    else setDraft(value === null ? '' : String(value));
  };
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        placeholder={t('chat.options.default')}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
    </>
  );
}

/** Temperature, answer length and reasoning effort of the chat model. */
export function ModelOptions({ model }: { model: ModelRef }) {
  const { t } = useTranslation();
  const effortId = useId();
  const options = useSettingsStore(
    (state) => state.settings.chatModelOptions[modelRefKey(model)] ?? defaultModelOptions,
  );
  return (
    <div
      className={styles['root']}
      role="group"
      aria-label={t('chat.options.label', { model: model.model })}
    >
      <div className={styles['grid']}>
        <NumberField
          label={t('chat.options.temperature')}
          value={options.temperature}
          min={0}
          max={2}
          step={0.1}
          onCommit={(temperature) => void save(model, { temperature })}
        />
        <NumberField
          label={t('chat.options.maxTokens')}
          value={options.maxTokens}
          min={1}
          max={1_000_000}
          step={256}
          onCommit={(maxTokens) => void save(model, { maxTokens })}
        />
        <label htmlFor={effortId}>{t('chat.options.effort')}</label>
        <select
          id={effortId}
          value={options.reasoningEffort ?? ''}
          onChange={(event) => {
            const value = EFFORTS.find((effort) => effort === event.target.value) ?? null;
            void save(model, { reasoningEffort: value });
          }}
        >
          <option value="">{t('chat.options.default')}</option>
          {EFFORTS.map((effort) => (
            <option key={effort} value={effort}>
              {t(`chat.options.effort_${effort}`)}
            </option>
          ))}
        </select>
      </div>
      <p className={styles['hint']}>{t('chat.options.hint')}</p>
    </div>
  );
}
