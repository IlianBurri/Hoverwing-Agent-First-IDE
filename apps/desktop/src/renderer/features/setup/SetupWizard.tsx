import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { CircleCheck, Gauge, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { recommendModels } from '@kestrel/shared';
import type { CatalogModel, ModelPurpose, SetupProgress, SpeedRating } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { StatusMessage } from '../../components/StatusMessage';
import { useAppStore } from '../../stores/app';
import { useSetupStore } from '../../stores/setup';
import { formatBytes } from '../docker/format';
import {
  cancelTask,
  finishSetup,
  installOllama,
  loadInstallPlan,
  loadSetup,
  pullModel,
  refreshOllama,
  runBenchmarks,
  skipSetup,
  updateCatalog,
} from './actions';
import styles from './SetupWizard.module.css';

const STEPS = ['welcome', 'hardware', 'runtime', 'models', 'speed', 'done'] as const;
type Step = (typeof STEPS)[number];
type Choice = Record<ModelPurpose, string | null>;

const ratingKind: Record<SpeedRating, 'success' | 'info' | 'warning'> = {
  fluid: 'success',
  usable: 'info',
  slow: 'warning',
};

function Progress({ progress, label }: { progress: SetupProgress | undefined; label: string }) {
  const { t } = useTranslation();
  if (!progress) return null;
  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  return (
    <div className={styles['progress']}>
      <progress aria-label={label} max={100} value={percent} />
      <span>
        {progress.status === 'running'
          ? progress.total > 0
            ? t('setup.progress', {
                done: formatBytes(progress.completed),
                total: formatBytes(progress.total),
                percent,
              })
            : t('setup.starting')
          : t(`setup.taskStatus.${progress.status}`)}
      </span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function HardwareStep({ choice }: { choice: Choice }) {
  const { t } = useTranslation();
  const { hardware, hardwareFailed, catalog } = useSetupStore();
  if (hardwareFailed) {
    return (
      <StatusMessage kind="error">
        {t('setup.hardwareFailed')}{' '}
        <Button variant="ghost" onClick={() => void loadSetup()}>
          {t('setup.retry')}
        </Button>
      </StatusMessage>
    );
  }
  if (!hardware || !catalog) {
    return (
      <p className={styles['loading']} role="status">
        <LoaderCircle size={16} aria-hidden="true" /> {t('setup.detecting')}
      </p>
    );
  }
  const { budget } = recommendModels(hardware, catalog);
  const model = (id: string | null) => catalog.models.find((entry) => entry.id === id);
  return (
    <>
      <dl className={styles['facts']} aria-label={t('setup.hardwareTitle')}>
        <Row label={t('setup.os')}>
          {hardware.os.name} {hardware.os.release} ({hardware.os.arch})
        </Row>
        <Row label={t('setup.cpu')}>
          {t('setup.cpuValue', { name: hardware.cpu.name, cores: hardware.cpu.cores })}
        </Row>
        <Row label={t('setup.ram')}>{formatBytes(hardware.ramBytes)}</Row>
        <Row label={t('setup.gpu')}>
          {hardware.gpus.length === 0
            ? t('setup.noGpu')
            : hardware.gpus
                .map((gpu) =>
                  gpu.shared
                    ? t('setup.gpuShared', { model: gpu.model })
                    : gpu.vramBytes
                      ? t('setup.gpuVram', { model: gpu.model, vram: formatBytes(gpu.vramBytes) })
                      : gpu.model,
                )
                .join(', ')}
        </Row>
        <Row label={t('setup.backend')}>{t(`setup.backendName.${hardware.backend}`)}</Row>
        <Row label={t('setup.disk')}>
          {hardware.diskFreeBytes === null ? '–' : formatBytes(hardware.diskFreeBytes)}
        </Row>
      </dl>
      {budget.kind === 'cpu' && <StatusMessage kind="info">{t('setup.cpuOnlyNote')}</StatusMessage>}
      <h3 className={styles['heading']}>{t('setup.recommendation')}</h3>
      <ul className={styles['list']}>
        {(['completion', 'chat'] as const).map((purpose) => {
          const entry = model(choice[purpose]);
          return (
            <li key={purpose}>
              <strong>{t(`setup.purpose.${purpose}`)}:</strong>{' '}
              {entry
                ? t('setup.modelWithSize', { name: entry.name, size: formatBytes(entry.sizeBytes) })
                : t('setup.noFit')}
            </li>
          );
        })}
      </ul>
      <p className={styles['hint']}>
        {t('setup.catalogInfo', { version: catalog.version, checked: catalog.checked })}{' '}
        {catalog.updateUrl && (
          <Button variant="ghost" onClick={() => void updateCatalog()}>
            {t('setup.updateCatalog')}
          </Button>
        )}
      </p>
    </>
  );
}

function RuntimeStep() {
  const { t } = useTranslation();
  const platform = useAppStore((state) => state.info?.platform);
  const { ollama, plan, installTask, installStarted, progress, hardware } = useSetupStore();

  useEffect(() => {
    if (ollama && !ollama.installed) void loadInstallPlan();
  }, [ollama]);

  if (!ollama) return <p role="status">{t('setup.checking')}</p>;
  const task = installTask ? progress[installTask] : undefined;
  const busy = task?.status === 'running' || task?.status === 'verifying';
  return (
    <>
      <p>{t('setup.runtimeText')}</p>
      {ollama.running ? (
        <StatusMessage kind="success">
          {t('setup.ollamaRunning', { version: ollama.version ?? '' })}
        </StatusMessage>
      ) : ollama.installed ? (
        <StatusMessage kind="warning">{t('setup.ollamaStopped')}</StatusMessage>
      ) : (
        <>
          <StatusMessage kind="info">{t('setup.ollamaMissing')}</StatusMessage>
          {plan === undefined && <p role="status">{t('setup.checking')}</p>}
          {plan && (
            <div className={styles['card']}>
              <dl className={styles['facts']}>
                <Row label={t('setup.source')}>{plan.source}</Row>
                <Row label={t('setup.file')}>
                  {plan.fileName} ({plan.version})
                </Row>
                <Row label={t('setup.size')}>{formatBytes(plan.sizeBytes)}</Row>
                <Row label={t('setup.checksum')}>
                  <code className={styles['hash']}>{plan.sha256}</code>
                </Row>
              </dl>
              {hardware?.diskFreeBytes !== null &&
                hardware?.diskFreeBytes !== undefined &&
                hardware.diskFreeBytes < plan.sizeBytes * 3 && (
                  <StatusMessage kind="warning">{t('setup.lowDisk')}</StatusMessage>
                )}
              <p className={styles['hint']}>{t('setup.installHint')}</p>
              <div className={styles['row']}>
                <Button variant="primary" disabled={busy} onClick={() => void installOllama()}>
                  {t('setup.install')}
                </Button>
                {busy && installTask && (
                  <Button variant="ghost" onClick={() => void cancelTask(installTask)}>
                    {t('setup.cancel')}
                  </Button>
                )}
              </div>
              <Progress progress={task} label={t('setup.install')} />
              {installStarted && (
                <StatusMessage kind="info">{t('setup.installerStarted')}</StatusMessage>
              )}
            </div>
          )}
          {plan === null && (
            <div className={styles['card']}>
              <p>{platform === 'linux' ? t('setup.linuxInstall') : t('setup.manualInstall')}</p>
              {platform === 'linux' && (
                <code className={styles['command']}>
                  curl -fsSL https://ollama.com/install.sh | sh
                </code>
              )}
            </div>
          )}
        </>
      )}
      <div className={styles['row']}>
        <Button onClick={() => void refreshOllama()}>{t('setup.checkAgain')}</Button>
      </div>
      <p className={styles['hint']}>{t('setup.otherRuntimes')}</p>
    </>
  );
}

function ModelRow({
  purpose,
  value,
  models,
  onChange,
}: {
  purpose: ModelPurpose;
  value: string | null;
  models: readonly CatalogModel[];
  onChange: (model: string | null) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const { ollama, pulls, progress } = useSetupStore();
  const installed = value !== null && ollama?.models.includes(value) === true;
  const taskId = value ? pulls[value] : undefined;
  const task = taskId ? progress[taskId] : undefined;
  const running = task?.status === 'running';
  return (
    <li className={styles['model']}>
      <label htmlFor={id}>{t(`setup.purpose.${purpose}`)}</label>
      <select
        id={id}
        className={styles['select']}
        value={value ?? ''}
        disabled={running}
        onChange={(event) => {
          onChange(event.target.value || null);
        }}
      >
        <option value="">{t('setup.noModel')}</option>
        {models
          .filter((entry) => entry.purpose === purpose)
          .map((entry) => (
            <option key={entry.id} value={entry.id}>
              {t('setup.modelWithSize', { name: entry.name, size: formatBytes(entry.sizeBytes) })}
            </option>
          ))}
      </select>
      {value &&
        (installed ? (
          <span className={styles['ok']}>
            <CircleCheck size={14} aria-hidden="true" /> {t('setup.installed')}
          </span>
        ) : running && taskId ? (
          <IconButton
            size="sm"
            icon={X}
            label={t('setup.cancelDownload', { model: value })}
            onClick={() => void cancelTask(taskId)}
          />
        ) : (
          <Button
            disabled={!ollama?.running}
            onClick={() => void pullModel(value)}
            aria-label={t('setup.downloadModel', { model: value })}
          >
            {t('setup.download')}
          </Button>
        ))}
      {value && !installed && (
        <div className={styles['modelProgress']}>
          <Progress progress={task} label={t('setup.downloadModel', { model: value })} />
        </div>
      )}
    </li>
  );
}

function ModelsStep({ choice, setChoice }: { choice: Choice; setChoice: (next: Choice) => void }) {
  const { t } = useTranslation();
  const { catalog, ollama, hardware } = useSetupStore();
  if (!catalog) return null;
  const missing = (['completion', 'chat'] as const)
    .map((purpose) => choice[purpose])
    .filter((model): model is string => model !== null && !ollama?.models.includes(model))
    .map((model) => catalog.models.find((entry) => entry.id === model)?.sizeBytes ?? 0)
    .reduce((sum, size) => sum + size, 0);
  return (
    <>
      <p>{t('setup.modelsText')}</p>
      {!ollama?.running && <StatusMessage kind="warning">{t('setup.needsOllama')}</StatusMessage>}
      <ul className={styles['models']}>
        {(['completion', 'chat'] as const).map((purpose) => (
          <ModelRow
            key={purpose}
            purpose={purpose}
            value={choice[purpose]}
            models={catalog.models}
            onChange={(model) => {
              setChoice({ ...choice, [purpose]: model });
            }}
          />
        ))}
      </ul>
      {missing > 0 && (
        <p className={styles['hint']}>
          {t('setup.downloadTotal', {
            size: formatBytes(missing),
            free: hardware?.diskFreeBytes ? formatBytes(hardware.diskFreeBytes) : '–',
          })}
        </p>
      )}
      {hardware?.diskFreeBytes !== null &&
        hardware?.diskFreeBytes !== undefined &&
        missing > hardware.diskFreeBytes - 2 * 1024 ** 3 && (
          <StatusMessage kind="warning">{t('setup.lowDisk')}</StatusMessage>
        )}
      <p className={styles['hint']}>{t('setup.modelsSource')}</p>
    </>
  );
}

function SpeedStep({ choice }: { choice: Choice }) {
  const { t } = useTranslation();
  const { ollama, benchmarks, benchmarking } = useSetupStore();
  const testable = (['completion', 'chat'] as const)
    .map((purpose) => ({ purpose, model: choice[purpose] }))
    .filter(
      (entry): entry is { purpose: ModelPurpose; model: string } =>
        entry.model !== null && ollama?.models.includes(entry.model) === true,
    );
  return (
    <>
      <p>{t('setup.speedText')}</p>
      {testable.length === 0 ? (
        <StatusMessage kind="info">{t('setup.speedNothing')}</StatusMessage>
      ) : (
        <>
          <div className={styles['row']}>
            <Button
              variant="primary"
              disabled={benchmarking}
              onClick={() => void runBenchmarks(testable)}
            >
              <Gauge size={14} aria-hidden="true" />
              {benchmarking ? t('setup.speedRunning') : t('setup.speedRun')}
            </Button>
          </div>
          <ul className={styles['list']} aria-label={t('setup.speedResults')}>
            {testable.map(({ model, purpose }) => {
              const result = benchmarks[model];
              return (
                <li key={model}>
                  <strong>{t(`setup.purpose.${purpose}`)}</strong> ({model}):{' '}
                  {result ? (
                    <StatusMessage kind={ratingKind[result.rating]}>
                      {t('setup.speedValue', {
                        speed: result.tokensPerSecond.toFixed(1),
                        rating: t(`setup.rating.${result.rating}`),
                      })}
                    </StatusMessage>
                  ) : (
                    '–'
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

/** First-start assistant: hardware, local runtime, models, speed test. */
export function SetupWizard() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('welcome');
  const [picked, setPicked] = useState<Choice | null>(null);
  const { hardware, catalog, ollama } = useSetupStore();

  useEffect(() => {
    void loadSetup();
  }, []);

  const recommendation = hardware && catalog ? recommendModels(hardware, catalog) : null;
  const choice: Choice = picked ?? {
    completion: recommendation?.completion?.id ?? null,
    chat: recommendation?.chat?.id ?? null,
  };
  const index = STEPS.indexOf(step);
  const installedChoice = {
    completion:
      choice.completion && ollama?.models.includes(choice.completion) ? choice.completion : null,
    chat: choice.chat && ollama?.models.includes(choice.chat) ? choice.chat : null,
  };

  return (
    <Modal title={t('setup.title')} onClose={skipSetup} size="lg">
      <div className={styles['root']}>
        <ol className={styles['steps']} aria-label={t('setup.stepsLabel')}>
          {STEPS.map((entry, position) => (
            <li
              key={entry}
              aria-current={entry === step ? 'step' : undefined}
              className={position < index ? styles['past'] : undefined}
            >
              {t(`setup.step.${entry}`)}
            </li>
          ))}
        </ol>
        <section className={styles['content']} aria-label={t(`setup.step.${step}`)}>
          {step === 'welcome' && (
            <>
              <p>{t('setup.welcomeText')}</p>
              <StatusMessage kind="info">{t('setup.honestNote')}</StatusMessage>
              <p className={styles['hint']}>{t('setup.privacyNote')}</p>
            </>
          )}
          {step === 'hardware' && <HardwareStep choice={choice} />}
          {step === 'runtime' && <RuntimeStep />}
          {step === 'models' && <ModelsStep choice={choice} setChoice={setPicked} />}
          {step === 'speed' && <SpeedStep choice={choice} />}
          {step === 'done' && (
            <>
              <p>{t('setup.doneText')}</p>
              <ul className={styles['list']}>
                {(['completion', 'chat'] as const).map((purpose) => (
                  <li key={purpose}>
                    <strong>{t(`setup.purpose.${purpose}`)}:</strong>{' '}
                    {installedChoice[purpose] ?? t('setup.notSet')}
                  </li>
                ))}
              </ul>
              {!installedChoice.chat && !installedChoice.completion && (
                <StatusMessage kind="info">
                  <TriangleAlert size={14} aria-hidden="true" /> {t('setup.doneNothing')}
                </StatusMessage>
              )}
              <p className={styles['hint']}>{t('setup.rerunHint')}</p>
            </>
          )}
        </section>
        <footer className={styles['footer']}>
          <Button variant="ghost" onClick={skipSetup}>
            {t('setup.skip')}
          </Button>
          <div className={styles['row']}>
            {index > 0 && (
              <Button
                onClick={() => {
                  setStep(STEPS[index - 1] ?? 'welcome');
                }}
              >
                {t('setup.back')}
              </Button>
            )}
            {step === 'done' ? (
              <Button variant="primary" onClick={() => void finishSetup(installedChoice)}>
                {t('setup.finish')}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  setStep(STEPS[index + 1] ?? 'done');
                }}
              >
                {step === 'welcome' ? t('setup.start') : t('setup.next')}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </Modal>
  );
}
