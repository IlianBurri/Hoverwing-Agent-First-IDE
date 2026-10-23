import { z } from 'zod';
import {
  checkpointChangeSchema,
  checkpointSchema,
  checkpointStatusSchema,
} from '../../schemas/checkpoints';
import { relativePathSchema } from '../../schemas/workspace';

const checkpointId = z.string().regex(/^[0-9a-f]{40,64}$/);

export const checkpointChannels = {
  'checkpoints:status': { request: z.undefined(), response: checkpointStatusSchema },
  'checkpoints:list': { request: z.undefined(), response: z.array(checkpointSchema) },
  'checkpoints:create': {
    request: z.object({ label: z.string().max(200) }),
    response: checkpointSchema,
  },
  /** What changed in the project since this checkpoint. */
  'checkpoints:changes': {
    request: z.object({ id: checkpointId }),
    response: z.array(checkpointChangeSchema),
  },
  /** A file's content at a checkpoint (null if it did not exist then). */
  'checkpoints:fileAt': {
    request: z.object({ id: checkpointId, path: relativePathSchema }),
    response: z.object({ content: z.string().nullable() }),
  },
  /**
   * Brings files back to the checkpoint (all, or only `paths`). The current
   * state is saved as a checkpoint first, so a restore can be undone.
   */
  'checkpoints:restore': {
    request: z.object({
      id: checkpointId,
      paths: z.array(relativePathSchema).max(10_000).optional(),
    }),
    response: z.object({ restored: z.number().int(), safety: checkpointSchema }),
  },
} as const;

export const checkpointEvents = {
  'checkpoints:changed': z.object({}),
} as const;
