import { useId, useState } from 'react';
import type { SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  isFreeModel,
  isLocalEndpoint,
  providerConfigSchema,
  providerTemplates,
} from '@kestrel/shared';
import type { ProviderConfig, ProviderTemplate, ProviderView } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { SegmentedControl } from '../../components/SegmentedControl';
import { StatusMessage } from '../../components/StatusMessage';
import { closeModal } from '../../stores/modals';
import { useProvidersStore } from '../../stores/providers';
import { clearApiKey, saveProvider } from './actions';
import styles from './ProviderDialog.module.css';

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'provider'
  );
}

function templateInfo(template: ProviderTemplate) {
  return providerTemplates.find((info) => info.template === template) ?? providerTemplates[0];
}

/** Add or edit a model provider: address, models (with fallbacks), API key. */
export function ProviderDialog({ provider }: { provider: ProviderView | null }) {
  const { t } = useTranslation();
  const existing = useProvidersStore((state) => state.providers);
  const editing = provider !== null;
  const initial = templateInfo(provider?.template ?? 'openrouter');
  const [template, setTemplate] = useState<ProviderTemplate>(provider?.template ?? 'openrouter');
  const [name, setName] = useState(provider?.name ?? initial?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? initial?.baseUrl ?? '');
  const [modelsText, setModelsText] = useState(provider?.models.join('\n') ?? initial?.model ?? '');
  const [apiKey, setApiKey] = useState('');
  const ids = { name: useId(), url: useId(), models: useId(), key: useId() };

  const id = provider?.id ?? slug(name);
  const idTaken = !editing && existing.some((entry) => entry.id === id);
  const models = modelsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const config: ProviderConfig = {
    id,
    name: name.trim(),
    template,
    baseUrl: baseUrl.trim(),
    models,
  };
  const valid = providerConfigSchema.safeParse(config).success && !idTaken;
  const local = isLocalEndpoint(config.baseUrl);
  const urlChanged = editing && provider.baseUrl !== config.baseUrl;
  const keySet = provider?.apiKeySet === true && !urlChanged;

  function chooseTemplate(next: ProviderTemplate) {
    const info = templateInfo(next);
    if (!info) return;
    setTemplate(next);
    setName(info.name);
    setBaseUrl(info.baseUrl);
    setModelsText(info.model);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!valid) return;
    if (await saveProvider(config, apiKey)) closeModal();
  }

  return (
    <Modal
      title={editing ? t('providers.editTitle', { name: provider.name }) : t('providers.addTitle')}
      onClose={closeModal}
      size="lg"
    >
      <form className={styles['form']} onSubmit={(event) => void submit(event)}>
        {!editing && (
          <>
            <span className={styles['label']}>{t('providers.template')}</span>
            <SegmentedControl<ProviderTemplate>
              label={t('providers.template')}
              options={providerTemplates.map((info) => ({
                value: info.template,
                label: info.template === 'custom' ? t('providers.custom') : info.name,
              }))}
              value={template}
              onChange={chooseTemplate}
            />
          </>
        )}

        <label htmlFor={ids.name}>{t('providers.name')}</label>
        <div className={styles['field']}>
          <input
            id={ids.name}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          {idTaken && <p className={styles['hint']}>{t('providers.idTaken', { id })}</p>}
        </div>

        <label htmlFor={ids.url}>{t('providers.baseUrl')}</label>
        <div className={styles['field']}>
          <input
            id={ids.url}
            value={baseUrl}
            spellCheck={false}
            placeholder="https://example.com/v1"
            onChange={(event) => {
              setBaseUrl(event.target.value);
            }}
          />
          <p className={styles['hint']}>{t('providers.baseUrlHint')}</p>
        </div>

        <label htmlFor={ids.models}>{t('providers.models')}</label>
        <div className={styles['field']}>
          <textarea
            id={ids.models}
            rows={3}
            value={modelsText}
            spellCheck={false}
            onChange={(event) => {
              setModelsText(event.target.value);
            }}
          />
          <p className={styles['hint']}>{t('providers.modelsHint')}</p>
        </div>

        <label htmlFor={ids.key}>{t('providers.apiKey')}</label>
        <div className={styles['field']}>
          <div className={styles['keyRow']}>
            <input
              id={ids.key}
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={
                keySet
                  ? t('providers.keyStored')
                  : local
                    ? t('providers.keyNotNeeded')
                    : t('providers.keyNotSet')
              }
              onChange={(event) => {
                setApiKey(event.target.value);
              }}
            />
            {keySet && (
              <Button variant="ghost" onClick={() => void clearApiKey(provider.id)}>
                {t('providers.clearKey')}
              </Button>
            )}
          </div>
          <p className={styles['hint']}>
            {urlChanged && provider.apiKeySet ? t('providers.keyDropped') : t('providers.keyHint')}
          </p>
        </div>

        <div className={styles['notes']}>
          {local ? (
            <StatusMessage kind="info">{t('providers.localNote')}</StatusMessage>
          ) : (
            <StatusMessage kind="info">{t('providers.remoteNote')}</StatusMessage>
          )}
          {models.some(isFreeModel) && (
            <StatusMessage kind="warning">{t('providers.freeNote')}</StatusMessage>
          )}
        </div>

        <div className={styles['actions']}>
          <Button type="submit" variant="primary" disabled={!valid}>
            {t('providers.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
