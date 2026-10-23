import { z } from 'zod';
import {
  containerIdSchema,
  dockerOverviewSchema,
  imageIdSchema,
  imageTagSchema,
} from '../../schemas/docker';
import { relativePathSchema } from '../../schemas/workspace';

const streamId = z.string().regex(/^[a-z]\d+$/);
const byContainer = z.object({ id: containerIdSchema });

/**
 * The Docker panel. One narrow channel per action; there is no channel that
 * runs arbitrary Docker commands. Builds only use Dockerfiles in the project.
 */
export const dockerChannels = {
  'docker:overview': { request: z.undefined(), response: dockerOverviewSchema },
  'docker:start': { request: byContainer, response: z.null() },
  'docker:stop': { request: byContainer, response: z.null() },
  'docker:restart': { request: byContainer, response: z.null() },
  /** `force` also removes a running container (the UI confirms first). */
  'docker:removeContainer': {
    request: z.object({ id: containerIdSchema, force: z.boolean() }),
    response: z.null(),
  },
  'docker:removeImage': { request: z.object({ id: imageIdSchema }), response: z.null() },
  /** Dockerfiles in the open project (relative paths). */
  'docker:findDockerfiles': { request: z.undefined(), response: z.array(relativePathSchema) },
  /** Builds an image from a project Dockerfile; output arrives as `docker:output`. */
  'docker:build': {
    request: z.object({ dockerfile: relativePathSchema, tag: imageTagSchema }),
    response: z.object({ streamId }),
  },
  /** Follows a container's logs; output arrives as `docker:output`. */
  'docker:openLogs': { request: byContainer, response: z.object({ streamId }) },
  /** Stops following logs, or cancels a running build. */
  'docker:closeStream': { request: z.object({ streamId }), response: z.null() },
} as const;

export const dockerEvents = {
  /** Containers or images changed (from Docker's event stream). */
  'docker:changed': z.object({}),
  'docker:output': z.object({ streamId, data: z.string() }),
  /** A log stream or build ended; `ok` is false for a failed build. */
  'docker:streamEnded': z.object({ streamId, ok: z.boolean() }),
} as const;
