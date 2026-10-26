import { useEffect, useId, useState } from 'react';
import {
  CircleCheck,
  CircleX,
  Cpu,
  Globe,
  KeyRound,
  LoaderCircle,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wand,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isFreeModel, isLocalEndpoint } from '@kestrel/shared';
import type { FimMode, ProviderView } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import { StatusMessage } from '../../components/StatusMessage';
import { PanelHeader } from '../../layout/PanelHeader';
import { openModal } from '../../stores/modals';
import { useProvidersStore } from '../../stores/providers';
import { useSettingsStore } from '../../stores/settings';
import {
  deleteProvider,
  refreshProviders,
  setChatModel,
  testProvider,
  updateCompletion,
} from './actions';
import { ModelSelect } from './ModelSelect';
import styles from './ModelsView.module.css';

function ProviderRow({ provider }: { provider: ProviderView }) {
  const { t } = useTranslation();
  const test = useProvidersStore((state) => state.tests[provider.id]);
  const local = isLocalEndpoint(provider.baseUrl);
  const [primary, ...fallbacks] = provider.models;

  return (
    <li className={styles['provider']} aria-label={provider.name}>
      <div className={styles['head']}>
        <span className={styles['name']}>{provider.name}</span>
        <div className={styles['actions']}>
          <IconButton
            size="sm"
            icon={RefreshCw}
            label={t('providers.testName', { name: provider.name })}
            disabled={test?.state === 'testing'}
            onClick={() => void testProvider(provider.id)}
          />
          <IconButton
            size="sm"
            icon={Pencil}
            label={t('providers.editName', { name: provider.name })}
            onClick={() => {
              openModal({ id: 'provider', provider });
            }}
          />
          <IconButton
            size="sm"
            icon={Trash2}
            label={t('providers.deleteName', { name: provider.name })}
            onClick={() => void deleteProvider(provider)}
          />
        </div>
      </div>
      <div className={styles['meta']}>
        <span className={styles['tag']} title={provider.baseUrl}>
          {local ? (
            <Monitor size={12} aria-hidden="true" />
          ) : (
            <Globe size={12} aria-hidden="true" />
          )}
          {local ? t('providers.local') : t('providers.remote')}
        </span>
        {!local && (
          <span className={styles['tag']}>
            <KeyRound size={12} aria-hidden="true" />
            {provider.apiKeySet ? t('providers.keySet') : t('providers.keyMissing')}
          </span>
        )}
      </div>
      <p className={styles['models']}>
        <code>{primary}</code>
        {fallbacks.length > 0 && (
          <span className={styles['fallbacks']}>
            {t('providers.fallbacks', { models: fallbacks.join(', ') })}
          </span>
        )}
      </p>
      {provider.models.some(isFreeModel) && (
        <p className={styles['warning']}>{t('providers.freeShort')}</p>
      )}
      {test?.state === 'testing' && (
        <p className={styles['state']}>
          <LoaderCircle size={12} aria-hidden="true" /> {t('providers.testing')}
        </p>
      )}
      {test?.state === 'ok' && (
        <p className={`${styles['state'] ?? ''} ${styles['ok'] ?? ''}`}>
          <CircleCheck size={12} aria-hidden="true" />
          {t('providers.connected', { count: test.models.length })}
          {provider.models.some((model) => !test.models.includes(model)) &&
            test.models.length > 0 &&
            ` · ${t('providers.modelNotListed')}`}
        </p>
      )}
      {test?.state === 'error' && (
        <p className={`${styles['state'] ?? ''} ${styles['failed'] ?? ''}`}>
          <CircleX size={12} aria-hidden="true" /> {test.message}
        </p>
      )}
    </li>
  );
}

/** Comma-separated language ids; saved when the field loses focus. */
function LanguagesInput({ id, languages }: { id: string; languages: readonly string[] }) {
  const [draft, setDraft] = useState(languages.join(', '));
  return (
    <input
      id={id}
      className={styles['input']}
      value={draft}
      spellCheck={false}
      placeholder="markdown, plaintext"
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={() =>
        void updateCompletion({
          disabledLanguages: [
            ...new Set(
              draft
                .split(',')
                .map((entry) => entry.trim().toLowerCase())
                .filter(Boolean),
            ),
          ],
        })
      }
    />
  );
}

function CompletionSettingsSection() {
  const { t } = useTranslation();
  const completion = useSettingsStore((state) => state.settings.completion);
  const error = useProvidersStore((state) => state.completionError);
  const ids = { enabled: useId(), model: useId(), languages: useId() };

  return (
    <section aria-labelledby={`${ids.enabled}-title`} className={styles['section']}>
      <h3 id={`${ids.enabled}-title`} className={styles['heading']}>
        {t('completion.title')}
      </h3>
      <label htmlFor={ids.enabled} className={styles['switch']}>
        <input
          id={ids.enabled}
          type="checkbox"
          checked={completion.enabled}
          disabled={!completion.model}
          onChange={(event) => void updateCompletion({ enabled: event.target.checked })}
        />
        {t('completion.enabled')}
      </label>
      <label htmlFor={ids.model} className={styles['label']}>
        {t('completion.model')}
      </label>
      <ModelSelect
        id={ids.model}
        label={t('completion.model')}
        value={completion.model}
        noneLabel={t('providers.noModel')}
        onChange={(model) =>
          void updateCompletion(model ? { model } : { model: null, enabled: false })
        }
      />
      <p className={styles['hint']}>{t('completion.modelHint')}</p>
      <span className={styles['label']}>{t('completion.fim')}</span>
      <SegmentedControl<FimMode>
        label={t('completion.fim')}
        options={[
          { value: 'auto', label: t('completion.fimMode.auto') },
          { value: 'on', label: t('completion.fimMode.on') },
          { value: 'off', label: t('completion.fimMode.off') },
        ]}
        value={completion.fim}
        onChange={(fim) => void updateCompletion({ fim })}
      />
      <p className={styles['hint']}>{t('completion.fimHint')}</p>
      <label htmlFor={ids.languages} className={styles['label']}>
        {t('completion.disabledLanguages')}
      </label>
      <LanguagesInput
        // A new key resets the draft when the saved list changes.
        key={completion.disabledLanguages.join(',')}
        id={ids.languages}
        languages={completion.disabledLanguages}
      />
      {error && completion.enabled && (
        <StatusMessage kind="warning">{t(`models.error.${error}`)}</StatusMessage>
      )}
    </section>
  );
}

/** Sidebar view: providers, the chat model and autocompletion. */
export function ModelsView() {
  const { t } = useTranslation();
  const providers = useProvidersStore((state) => state.providers);
  const chatModel = useSettingsStore((state) => state.settings.chatModel);
  const chatId = useId();

  useEffect(() => {
    void refreshProviders();
  }, []);

  const add = () => {
    openModal({ id: 'provider', provider: null });
  };

  return (
    <>
      <PanelHeader
        id="sidebar-title"
        title={t('models.title')}
        actions={
          <>
            <IconButton
              size="sm"
              icon={Wand}
              label={t('setup.open')}
              onClick={() => {
                openModal({ id: 'setup' });
              }}
            />
            <IconButton size="sm" icon={Plus} label={t('providers.add')} onClick={add} />
          </>
        }
      />
      <div className={styles['root']}>
        {providers.length === 0 ? (
          <EmptyState icon={Cpu} title={t('models.emptyTitle')} description={t('models.emptyText')}>
            <Button variant="primary" onClick={add}>
              {t('providers.add')}
            </Button>
          </EmptyState>
        ) : (
          <>
            <section aria-label={t('providers.title')}>
              <h3 className={styles['heading']}>{t('providers.title')}</h3>
              <ul className={styles['list']}>
                {providers.map((provider) => (
                  <ProviderRow key={provider.id} provider={provider} />
                ))}
              </ul>
            </section>
            <section aria-labelledby={`${chatId}-title`} className={styles['section']}>
              <h3 id={`${chatId}-title`} className={styles['heading']}>
                {t('chat.title')}
              </h3>
              <label htmlFor={chatId} className={styles['label']}>
                {t('chat.model')}
              </label>
              <ModelSelect
                id={chatId}
                label={t('chat.model')}
                value={chatModel}
                noneLabel={t('providers.noModel')}
                onChange={(ref) => void setChatModel(ref)}
              />
              <p className={styles['hint']}>{t('chat.modelHint')}</p>
            </section>
            <CompletionSettingsSection />
          </>
        )}
        <p className={styles['hint']}>{t('models.byoNote')}</p>
      </div>
    </>
  );
}
