import { CircleCheck, CircleX, Hammer, LoaderCircle, ScrollText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import type { DockerStream } from '../../stores/docker';
import { useDockerStore } from '../../stores/docker';
import { closeStream } from './actions';
import { OutputInstance } from './OutputInstance';
import styles from './DockerOutput.module.css';

function StreamState({ stream }: { stream: DockerStream }) {
  const { t } = useTranslation();
  if (stream.result === null) {
    return stream.kind === 'build' ? (
      <span className={styles['state']}>
        <LoaderCircle size={12} aria-hidden="true" />
        {t('docker.building')}
      </span>
    ) : null;
  }
  if (stream.kind === 'logs') return <span className={styles['state']}>{t('docker.ended')}</span>;
  return stream.result ? (
    <span className={`${styles['state'] ?? ''} ${styles['ok'] ?? ''}`}>
      <CircleCheck size={12} aria-hidden="true" />
      {t('docker.buildOk')}
    </span>
  ) : (
    <span className={`${styles['state'] ?? ''} ${styles['failed'] ?? ''}`}>
      <CircleX size={12} aria-hidden="true" />
      {t('docker.buildFailed')}
    </span>
  );
}

/** Bottom panel "Docker": container logs and build output, one tab each. */
export function DockerOutput() {
  const { t } = useTranslation();
  const streams = useDockerStore((state) => state.streams);
  const active = useDockerStore((state) => state.activeStream);

  if (streams.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title={t('docker.outputEmptyTitle')}
        description={t('docker.outputEmptyText')}
      />
    );
  }
  return (
    <div className={styles['root']}>
      <div className={styles['outputs']}>
        {streams.map((stream) => (
          <OutputInstance
            key={stream.streamId}
            streamId={stream.streamId}
            visible={stream.streamId === active}
          />
        ))}
      </div>
      <div
        role="tablist"
        aria-label={t('docker.outputs')}
        aria-orientation="vertical"
        className={styles['list']}
      >
        {streams.map((stream) => (
          <div key={stream.streamId} className={styles['entry']}>
            <button
              type="button"
              role="tab"
              aria-selected={stream.streamId === active}
              className={styles['tab']}
              onClick={() => {
                useDockerStore.setState({ activeStream: stream.streamId });
              }}
            >
              {stream.kind === 'build' ? (
                <Hammer size={14} aria-hidden="true" />
              ) : (
                <ScrollText size={14} aria-hidden="true" />
              )}
              <span className={styles['title']}>{stream.title}</span>
              <StreamState stream={stream} />
            </button>
            <IconButton
              size="sm"
              icon={X}
              label={t('docker.closeOutput', { name: stream.title })}
              onClick={() => void closeStream(stream.streamId)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
