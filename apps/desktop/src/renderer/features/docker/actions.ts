import { imageTagSchema } from '@kestrel/shared';
import type { ContainerSummary, ImageSummary } from '@kestrel/shared';
import { i18next } from '../../i18n';
import { notifyError } from '../../lib/errors';
import { choose, confirm, prompt } from '../../stores/dialogs';
import { addStream, removeStream, setBusy, useDockerStore } from '../../stores/docker';
import { setPanelOpen } from '../../stores/layout';
import { useSettingsStore } from '../../stores/settings';
import { notify } from '../../stores/toasts';
import { useWorkspaceStore } from '../../stores/workspace';
import { suggestTag } from './format';

const t = i18next.t.bind(i18next);

export async function refreshDocker(): Promise<void> {
  const result = await window.kestrel.invoke('docker:overview');
  if (result.ok) useDockerStore.setState({ overview: result.data });
  if (useWorkspaceStore.getState().info) {
    const files = await window.kestrel.invoke('docker:findDockerfiles');
    useDockerStore.setState({ dockerfiles: files.ok ? files.data : [] });
  } else {
    useDockerStore.setState({ dockerfiles: [] });
  }
}

type ContainerAction = 'start' | 'stop' | 'restart';

export async function containerAction(
  container: ContainerSummary,
  action: ContainerAction,
): Promise<void> {
  setBusy(container.id, true);
  const result = await window.kestrel.invoke(`docker:${action}`, { id: container.id });
  setBusy(container.id, false);
  if (!result.ok) notifyError(t(`docker.action.${action}`), result.error);
  await refreshDocker();
}

export async function removeContainer(container: ContainerSummary): Promise<void> {
  const running = container.state === 'running' || container.state === 'restarting';
  const confirmed = await confirm({
    title: running
      ? t('docker.removeRunningTitle', { name: container.name })
      : t('docker.removeContainerTitle', { name: container.name }),
    message: container.sandbox
      ? t('docker.removeSandboxMessage')
      : t('docker.removeContainerMessage'),
    confirmLabel: running ? t('docker.stopAndRemove') : t('docker.remove'),
    danger: true,
  });
  if (!confirmed) return;
  setBusy(container.id, true);
  const result = await window.kestrel.invoke('docker:removeContainer', {
    id: container.id,
    force: running,
  });
  setBusy(container.id, false);
  if (!result.ok) notifyError(t('docker.remove'), result.error);
  await refreshDocker();
}

export function imageName(image: ImageSummary): string {
  return image.tags[0] ?? image.id.slice('sha256:'.length, 'sha256:'.length + 12);
}

export async function removeImage(image: ImageSummary): Promise<void> {
  const confirmed = await confirm({
    title: t('docker.removeImageTitle', { name: imageName(image) }),
    message: t('docker.removeImageMessage'),
    confirmLabel: t('docker.remove'),
    danger: true,
  });
  if (!confirmed) return;
  setBusy(image.id, true);
  const result = await window.kestrel.invoke('docker:removeImage', { id: image.id });
  setBusy(image.id, false);
  if (!result.ok) notifyError(t('docker.remove'), result.error);
  await refreshDocker();
}

/** Shows the Docker tab of the bottom panel. */
export function showDockerOutput(): void {
  const { settings, update } = useSettingsStore.getState();
  setPanelOpen('bottom', true);
  if (settings.layout.bottomView !== 'docker') {
    void update({ layout: { ...settings.layout, bottomView: 'docker' } });
  }
}

export async function openLogs(container: ContainerSummary): Promise<void> {
  const existing = useDockerStore
    .getState()
    .streams.find((stream) => stream.kind === 'logs' && stream.title === container.name);
  if (existing?.result === null) {
    useDockerStore.setState({ activeStream: existing.streamId });
    showDockerOutput();
    return;
  }
  const result = await window.kestrel.invoke('docker:openLogs', { id: container.id });
  if (!result.ok) {
    notifyError(t('docker.action.logs'), result.error);
    return;
  }
  addStream({ streamId: result.data.streamId, kind: 'logs', title: container.name, result: null });
  showDockerOutput();
}

/** Asks for the tag (and the Dockerfile, if there are several) and builds. */
export async function buildImage(dockerfile?: string): Promise<void> {
  let file = dockerfile;
  if (!file) {
    await refreshDocker();
    const { dockerfiles } = useDockerStore.getState();
    if (dockerfiles.length === 0) {
      notify('info', t('docker.noDockerfiles'));
      return;
    }
    file =
      dockerfiles.length === 1
        ? dockerfiles[0]
        : ((await choose({
            title: t('docker.chooseDockerfile'),
            message: t('docker.chooseDockerfileText'),
            choices: dockerfiles.slice(0, 6).map((path) => ({ id: path, label: path })),
          })) ?? undefined);
  }
  if (!file) return;
  const projectName = useWorkspaceStore.getState().info?.name ?? 'app';
  const tag = await prompt({
    title: t('docker.buildTitle', { file }),
    label: t('docker.tag'),
    initialValue: suggestTag(projectName, file),
    confirmLabel: t('docker.build'),
    validate: (value) =>
      imageTagSchema.safeParse(value.trim()).success ? null : t('docker.tagInvalid'),
  });
  if (tag === null) return;
  const result = await window.kestrel.invoke('docker:build', {
    dockerfile: file,
    tag: tag.trim(),
  });
  if (!result.ok) {
    notifyError(t('docker.build'), result.error);
    return;
  }
  addStream({ streamId: result.data.streamId, kind: 'build', title: tag.trim(), result: null });
  showDockerOutput();
}

/** Closes a tab; a running build is cancelled, a log stream stopped. */
export async function closeStream(streamId: string): Promise<void> {
  const stream = useDockerStore.getState().streams.find((entry) => entry.streamId === streamId);
  if (stream?.kind === 'build' && stream.result === null) {
    const confirmed = await confirm({
      title: t('docker.cancelBuildTitle', { name: stream.title }),
      message: t('docker.cancelBuildMessage'),
      confirmLabel: t('docker.cancelBuild'),
      danger: true,
    });
    if (!confirmed) return;
  }
  if (stream?.result === null) await window.kestrel.invoke('docker:closeStream', { streamId });
  removeStream(streamId);
}
