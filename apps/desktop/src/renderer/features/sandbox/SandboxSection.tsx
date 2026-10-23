import { useEffect, useId, useState } from 'react';
import { Hammer, LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { imageReferenceSchema } from '@kestrel/shared';
import type { AgentSandbox } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { StatusMessage } from '../../components/StatusMessage';
import { useSandboxStore } from '../../stores/sandbox';
import { useSettingsStore } from '../../stores/settings';
import { openLoginTerminal, prepareSandbox, refreshSandboxStatus } from './actions';
import { DockerHelp } from './DockerHelp';
import styles from './SandboxSection.module.css';

interface SandboxSectionProps {
  sandbox: AgentSandbox;
  onChange: (sandbox: AgentSandbox) => void;
  /** Saved agent (id + name); null while a new agent is not saved yet. */
  saved: { id: string; name: string } | null;
}

/** "Where does the agent run?" part of the agent settings. */
export function SandboxSection({ sandbox, onChange, saved }: SandboxSectionProps) {
  const { t } = useTranslation();
  const status = useSandboxStore((state) => state.status);
  const baseImage = useSettingsStore((state) => state.settings.sandboxBaseImage);
  const updateSettings = useSettingsStore((state) => state.update);
  // Text being edited; null shows the stored setting.
  const [edited, setEdited] = useState<string | null>(null);
  const image = edited ?? baseImage;
  const ids = { enabled: useId(), memory: useId(), cpus: useId(), image: useId() };

  useEffect(() => {
    void refreshSandboxStatus();
  }, []);

  const imageValid = imageReferenceSchema.safeParse(image.trim()).success;
  function applyImage() {
    const next = image.trim();
    if (!imageValid) return;
    setEdited(null);
    if (next !== baseImage) {
      void updateSettings({ sandboxBaseImage: next }).then(refreshSandboxStatus);
    }
  }

  const available = status?.docker === 'available';
  return (
    <>
      <span className={styles['label']}>{t('sandbox.section')}</span>
      <div className={styles['root']}>
        <label htmlFor={ids.enabled} className={styles['checkbox']}>
          <input
            id={ids.enabled}
            type="checkbox"
            checked={sandbox.enabled}
            onChange={(event) => {
              onChange({ ...sandbox, enabled: event.target.checked });
            }}
          />
          {t('sandbox.enabled')}
        </label>
        <p className={styles['hint']}>
          {sandbox.enabled ? t('sandbox.enabledHint') : t('sandbox.directHint')}
        </p>

        {status && status.docker !== 'available' && <DockerHelp state={status.docker} />}

        {sandbox.enabled && (
          <div className={styles['limits']}>
            <label htmlFor={ids.memory}>{t('sandbox.memory')}</label>
            <input
              id={ids.memory}
              type="number"
              min={0.5}
              max={256}
              step={0.5}
              value={sandbox.memoryMb / 1024}
              onChange={(event) => {
                const gb = Number(event.target.value);
                if (gb >= 0.5) onChange({ ...sandbox, memoryMb: Math.round(gb * 1024) });
              }}
            />
            <label htmlFor={ids.cpus}>{t('sandbox.cpus')}</label>
            <input
              id={ids.cpus}
              type="number"
              min={0.5}
              max={128}
              step={0.5}
              value={sandbox.cpus}
              onChange={(event) => {
                const cpus = Number(event.target.value);
                if (cpus >= 0.5) onChange({ ...sandbox, cpus });
              }}
            />
          </div>
        )}

        <label htmlFor={ids.image} className={styles['imageLabel']}>
          {t('sandbox.baseImage')}
        </label>
        <input
          id={ids.image}
          value={image}
          spellCheck={false}
          aria-invalid={!imageValid}
          onChange={(event) => {
            setEdited(event.target.value);
          }}
          onBlur={applyImage}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              applyImage();
            }
          }}
        />
        <p className={styles['hint']}>{t('sandbox.baseImageHint')}</p>

        {available && (
          <div className={styles['actions']}>
            {status.imageReady ? (
              <StatusMessage kind="success">{t('sandbox.imageReady')}</StatusMessage>
            ) : (
              <StatusMessage kind="info">
                {status.preparing ? t('sandbox.preparing') : t('sandbox.imageMissing')}
              </StatusMessage>
            )}
            {!status.imageReady && (
              <Button disabled={status.preparing} onClick={() => void prepareSandbox()}>
                <Hammer size={14} aria-hidden="true" />
                {t('sandbox.prepare')}
              </Button>
            )}
          </div>
        )}
        {available && sandbox.enabled && saved && (
          <>
            <Button
              className={styles['login']}
              disabled={status.preparing}
              onClick={() => void openLoginTerminal(saved.id, saved.name)}
            >
              <LogIn size={14} aria-hidden="true" />
              {t('sandbox.login')}
            </Button>
            <p className={styles['hint']}>{t('sandbox.loginHint')}</p>
          </>
        )}
      </div>
    </>
  );
}
