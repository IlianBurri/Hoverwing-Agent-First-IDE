import { useEffect, useId } from 'react';
import {
  CircleDot,
  CircleStop,
  Container,
  ExternalLink,
  Hammer,
  Layers,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  ScrollText,
  Square,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ContainerState, ContainerSummary, ImageSummary } from '@kestrel/shared';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { PanelHeader } from '../../layout/PanelHeader';
import { useDockerStore } from '../../stores/docker';
import { useWorkspaceStore } from '../../stores/workspace';
import { DockerHelp } from '../sandbox';
import {
  buildImage,
  containerAction,
  imageName,
  openLogs,
  refreshDocker,
  removeContainer,
  removeImage,
} from './actions';
import { formatBytes, portUrl } from './format';
import styles from './DockerView.module.css';

/** While Docker is not reachable, check again this often. */
const RETRY_MS = 5000;

const stateIcons: Record<ContainerState, LucideIcon> = {
  running: CircleDot,
  paused: Pause,
  restarting: RotateCw,
  created: CircleStop,
  exited: CircleStop,
  removing: Trash2,
  dead: TriangleAlert,
  unknown: TriangleAlert,
};

function ContainerRow({ container }: { container: ContainerSummary }) {
  const { t } = useTranslation();
  const busy = useDockerStore((state) => state.busy.includes(container.id));
  const Icon = stateIcons[container.state];
  const running = container.state === 'running' || container.state === 'restarting';
  return (
    <li className={styles['row']} aria-label={container.name} aria-busy={busy}>
      <div className={styles['main']}>
        <span className={`${styles['state'] ?? ''} ${styles[container.state] ?? ''}`}>
          <Icon size={14} aria-hidden="true" />
          {t(`docker.state.${container.state}`)}
        </span>
        <span className={styles['name']} title={container.status}>
          {container.name}
        </span>
        {container.sandbox && <span className={styles['tag']}>{t('docker.sandboxTag')}</span>}
        {container.composeProject && (
          <span className={styles['tag']} title={t('docker.composeProject')}>
            {container.composeProject}
          </span>
        )}
      </div>
      <div className={styles['meta']}>
        <span className={styles['image']}>{container.image}</span>
        {container.ports.map((port) => {
          const url = portUrl(port);
          const text =
            port.publicPort === null
              ? `${String(port.privatePort)}/${port.protocol}`
              : `${String(port.publicPort)} → ${String(port.privatePort)}`;
          return url && running ? (
            <button
              key={`${String(port.privatePort)}-${String(port.publicPort)}-${port.protocol}`}
              type="button"
              className={styles['port']}
              title={t('docker.openPort', { url })}
              onClick={() => void window.kestrel.invoke('app:openExternalUrl', { url })}
            >
              {text}
              <ExternalLink size={12} aria-hidden="true" />
            </button>
          ) : (
            <span
              key={`${String(port.privatePort)}-${String(port.publicPort)}-${port.protocol}`}
              className={styles['portText']}
            >
              {text}
            </span>
          );
        })}
      </div>
      <div className={styles['actions']}>
        {running ? (
          <IconButton
            size="sm"
            icon={Square}
            label={t('docker.action.stopName', { name: container.name })}
            disabled={busy}
            onClick={() => void containerAction(container, 'stop')}
          />
        ) : (
          <IconButton
            size="sm"
            icon={Play}
            label={t('docker.action.startName', { name: container.name })}
            disabled={busy}
            onClick={() => void containerAction(container, 'start')}
          />
        )}
        <IconButton
          size="sm"
          icon={RotateCw}
          label={t('docker.action.restartName', { name: container.name })}
          disabled={busy}
          onClick={() => void containerAction(container, 'restart')}
        />
        <IconButton
          size="sm"
          icon={ScrollText}
          label={t('docker.action.logsName', { name: container.name })}
          onClick={() => void openLogs(container)}
        />
        <IconButton
          size="sm"
          icon={Trash2}
          label={t('docker.action.removeName', { name: container.name })}
          disabled={busy}
          onClick={() => void removeContainer(container)}
        />
      </div>
    </li>
  );
}

function ImageRow({ image }: { image: ImageSummary }) {
  const { t, i18n } = useTranslation();
  const busy = useDockerStore((state) => state.busy.includes(image.id));
  const name = imageName(image);
  return (
    <li className={styles['row']} aria-label={name} aria-busy={busy}>
      <div className={styles['main']}>
        <Layers size={14} aria-hidden="true" />
        <span className={styles['name']} title={image.tags.join(', ') || image.id}>
          {name}
        </span>
      </div>
      <div className={styles['meta']}>
        <span>{formatBytes(image.size)}</span>
        <span>{new Date(image.created).toLocaleDateString(i18n.language)}</span>
        {image.containers > 0 && <span>{t('docker.usedBy', { count: image.containers })}</span>}
      </div>
      <div className={styles['actions']}>
        <IconButton
          size="sm"
          icon={Trash2}
          label={t('docker.action.removeName', { name })}
          disabled={busy}
          onClick={() => void removeImage(image)}
        />
      </div>
    </li>
  );
}

export function DockerView() {
  const { t } = useTranslation();
  const filterId = useId();
  const workspace = useWorkspaceStore((state) => state.info);
  const { overview, dockerfiles, onlyProject } = useDockerStore();
  const docker = overview?.docker ?? null;

  useEffect(() => {
    void refreshDocker();
  }, [workspace?.root]);
  useEffect(() => {
    if (docker === null || docker === 'available') return;
    const timer = window.setInterval(() => void refreshDocker(), RETRY_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [docker]);

  const header = (
    <PanelHeader
      id="sidebar-title"
      title={t('docker.title')}
      actions={
        <>
          {workspace && docker === 'available' && (
            <IconButton
              size="sm"
              icon={Hammer}
              label={t('docker.buildImage')}
              onClick={() => void buildImage()}
            />
          )}
          <IconButton
            size="sm"
            icon={RefreshCw}
            label={t('docker.refresh')}
            onClick={() => void refreshDocker()}
          />
        </>
      }
    />
  );

  if (docker === null) return header;
  if (docker !== 'available') {
    return (
      <>
        {header}
        <div className={styles['help']}>
          <DockerHelp state={docker} />
        </div>
      </>
    );
  }

  const containers = (overview?.containers ?? []).filter(
    (container) => !onlyProject || container.inProject,
  );
  const images = overview?.images ?? [];

  return (
    <>
      {header}
      <div className={styles['root']}>
        {workspace && (
          <label htmlFor={filterId} className={styles['filter']}>
            <input
              id={filterId}
              type="checkbox"
              checked={onlyProject}
              onChange={(event) => {
                useDockerStore.setState({ onlyProject: event.target.checked });
              }}
            />
            {t('docker.onlyProject')}
          </label>
        )}

        <section aria-labelledby="docker-containers">
          <h3 id="docker-containers" className={styles['heading']}>
            {t('docker.containers', { count: containers.length })}
          </h3>
          {containers.length === 0 ? (
            <EmptyState
              icon={Container}
              title={t('docker.noContainers')}
              description={onlyProject ? t('docker.noProjectContainers') : ''}
            />
          ) : (
            <ul className={styles['list']} aria-label={t('docker.containersList')}>
              {containers.map((container) => (
                <ContainerRow key={container.id} container={container} />
              ))}
            </ul>
          )}
        </section>

        {workspace && (
          <section aria-labelledby="docker-dockerfiles">
            <h3 id="docker-dockerfiles" className={styles['heading']}>
              {t('docker.dockerfiles')}
            </h3>
            {dockerfiles.length === 0 ? (
              <p className={styles['hint']}>{t('docker.noDockerfiles')}</p>
            ) : (
              <ul className={styles['list']} aria-label={t('docker.dockerfiles')}>
                {dockerfiles.map((path) => (
                  <li key={path} className={styles['fileRow']}>
                    <code className={styles['name']}>{path}</code>
                    <Button variant="ghost" onClick={() => void buildImage(path)}>
                      <Hammer size={14} aria-hidden="true" />
                      {t('docker.build')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section aria-labelledby="docker-images">
          <h3 id="docker-images" className={styles['heading']}>
            {t('docker.images', { count: images.length })}
          </h3>
          {images.length === 0 ? (
            <p className={styles['hint']}>{t('docker.noImages')}</p>
          ) : (
            <ul className={styles['list']} aria-label={t('docker.imagesList')}>
              {images.map((image) => (
                <ImageRow key={image.id} image={image} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
