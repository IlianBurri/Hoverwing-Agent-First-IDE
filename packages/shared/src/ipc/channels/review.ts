import { z } from 'zod';
import { hunkSelectionSchema, reviewDiffSchema, reviewFileSchema } from '../../schemas/review';
import { relativePathSchema } from '../../schemas/workspace';

export const reviewChannels = {
  /** Agent changes waiting for a decision in the open project. */
  'review:list': { request: z.undefined(), response: z.array(reviewFileSchema) },
  'review:diff': { request: z.object({ path: relativePathSchema }), response: reviewDiffSchema },
  /**
   * Decides a file: the selected hunks are kept, the others discarded.
   * "all" accepts the change, "none" rejects it completely.
   */
  'review:resolve': {
    request: z.object({ path: relativePathSchema, keep: hunkSelectionSchema }),
    response: z.null(),
  },
  'review:resolveAll': {
    request: z.object({ keep: z.enum(['all', 'none']) }),
    response: z.number().int(),
  },
} as const;

export const reviewEvents = {
  'review:changed': z.object({}),
} as const;
