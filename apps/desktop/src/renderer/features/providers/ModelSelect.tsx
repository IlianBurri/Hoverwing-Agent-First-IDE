import type { ModelRef } from '@kestrel/shared';
import { useProvidersStore } from '../../stores/providers';
import { parseRefKey, refKey } from '../../stores/providers';
import styles from './ModelSelect.module.css';

interface ModelSelectProps {
  id?: string;
  label: string;
  value: ModelRef | null;
  /** Text of the "no model" option. */
  noneLabel: string;
  onChange: (ref: ModelRef | null) => void;
}

/** Picks a model of any configured provider, grouped by provider. */
export function ModelSelect({ id, label, value, noneLabel, onChange }: ModelSelectProps) {
  const providers = useProvidersStore((state) => state.providers);
  const current = value ? refKey(value) : '';
  const known = providers.some((provider) =>
    provider.models.some((model) => refKey({ providerId: provider.id, model }) === current),
  );
  return (
    <select
      id={id}
      aria-label={id ? undefined : label}
      className={styles['root']}
      value={current}
      onChange={(event) => {
        onChange(parseRefKey(event.target.value));
      }}
    >
      <option value="">{noneLabel}</option>
      {value && !known && <option value={current}>{value.model}</option>}
      {providers.map((provider) => (
        <optgroup key={provider.id} label={provider.name}>
          {provider.models.map((model) => (
            <option key={model} value={refKey({ providerId: provider.id, model })}>
              {model}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
