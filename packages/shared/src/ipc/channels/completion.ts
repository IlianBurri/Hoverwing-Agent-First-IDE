import { z } from 'zod';
import { completionRequestSchema, completionResultSchema } from '../../schemas/completion';

/** Inline suggestions in the editor. A new request cancels the previous one. */
export const completionChannels = {
  'completion:request': { request: completionRequestSchema, response: completionResultSchema },
  'completion:cancel': {
    request: z.object({ requestId: z.number().int().nonnegative() }),
    response: z.null(),
  },
} as const;
