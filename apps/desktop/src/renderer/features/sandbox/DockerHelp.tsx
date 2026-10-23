import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DockerState } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { StatusMessage } from '../../components/StatusMessage';
import { useAppStore } from '../../stores/app';
import { refreshSandboxStatus } from './actions';
import styles from './DockerHelp.module.css';

const INSTALL_URL = 'https://docs.docker.com/get-started/get-docker/';
const LINUX_PERMISSION_URL = 'https://docs.docker.com/engine/install/linux-postinstall/';

/** Explains, per operating system, how to get Docker working. */
export function DockerHelp({ state }: { state: Exclude<DockerState, 'available'> }) {
  const { t } = useTranslation();
  const platform = useAppStore((app) => app.info?.platform ?? 'other');
  const os = platform === 'darwin' ? 'mac' : platform === 'win32' ? 'windows' : 'linux';
  const link =
    state === 'noPermission' && os === 'linux'
      ? LINUX_PERMISSION_URL
      : state === 'notInstalled'
        ? INSTALL_URL
        : null;

  return (
    <div className={styles['root']}>
      <StatusMessage kind="warning">{t(`sandbox.docker.${state}`)}</StatusMessage>
      <p className={styles['text']}>{t(`sandbox.help.${state}.${os}`)}</p>
      <div className={styles['actions']}>
        {link && (
          <Button
            variant="ghost"
            onClick={() => void window.kestrel.invoke('app:openExternalUrl', { url: link })}
          >
            <ExternalLink size={14} aria-hidden="true" />
            {t('sandbox.help.openDocs')}
          </Button>
        )}
        <Button variant="ghost" onClick={() => void refreshSandboxStatus()}>
          {t('sandbox.help.retry')}
        </Button>
      </div>
    </div>
  );
}
