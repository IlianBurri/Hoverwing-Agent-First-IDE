import type { DockerApi } from './api';

const missing = (name: string) => () => Promise.reject(new Error(`fake docker: ${name}`));

/** A DockerApi for unit tests: every call fails unless overridden. */
export function fakeDockerApi(overrides: Partial<DockerApi> = {}): DockerApi {
  return {
    ping: () => Promise.resolve(),
    version: () => Promise.resolve('29.0.0'),
    imageExists: () => Promise.resolve(false),
    buildImage: missing('buildImage'),
    listContainers: () => Promise.resolve([]),
    listContainerInfos: () => Promise.resolve([]),
    listImages: () => Promise.resolve([]),
    startContainer: missing('startContainer'),
    stopContainer: missing('stopContainer'),
    restartContainer: missing('restartContainer'),
    removeContainer: missing('removeContainer'),
    removeImage: missing('removeImage'),
    watchEvents: () => Promise.resolve(() => undefined),
    followLogs: missing('followLogs'),
    run: missing('run'),
    ...overrides,
  };
}
