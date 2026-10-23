import type { ModuleHandlers } from '../../ipc/handlers';
import type { WorkspaceManager } from '../workspace';
import type { DockerPanelService } from './panel';

export function createDockerHandlers(
  panel: DockerPanelService,
  workspaces: WorkspaceManager,
): ModuleHandlers<'docker'> {
  return {
    'docker:overview': (_request, { sender }) =>
      panel.overview(workspaces.get(sender.id)?.root ?? null),
    'docker:start': async ({ id }) => {
      await panel.start(id);
      return null;
    },
    'docker:stop': async ({ id }) => {
      await panel.stop(id);
      return null;
    },
    'docker:restart': async ({ id }) => {
      await panel.restart(id);
      return null;
    },
    'docker:removeContainer': async ({ id, force }) => {
      await panel.removeContainer(id, force);
      return null;
    },
    'docker:removeImage': async ({ id }) => {
      await panel.removeImage(id);
      return null;
    },
    'docker:findDockerfiles': (_request, { sender }) =>
      panel.findDockerfiles(workspaces.requireRoot(sender.id)),
    'docker:build': async ({ dockerfile, tag }, { sender }) => ({
      streamId: await panel.build(sender.id, workspaces.requireRoot(sender.id), dockerfile, tag),
    }),
    'docker:openLogs': async ({ id }, { sender }) => ({
      streamId: await panel.openLogs(sender.id, id),
    }),
    'docker:closeStream': ({ streamId }, { sender }) => {
      panel.closeStream(sender.id, streamId);
      return null;
    },
  };
}
