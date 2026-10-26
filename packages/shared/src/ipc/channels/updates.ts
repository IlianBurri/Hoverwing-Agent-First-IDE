import { z } from 'zod';
import { updateStatusSchema } from '../../schemas/updates';

/** App updates from the GitHub releases. Nothing is downloaded without a click. */
export const updateChannels = {
  'updates:status': { request: z.undefined(), response: updateStatusSchema },
  'updates:check': { request: z.undefined(), response: updateStatusSchema },
  'updates:download': { request: z.undefined(), response: z.null() },
  /** Closes the app, installs the downloaded update and starts it again. */
  'updates:install': { request: z.undefined(), response: z.null() },
} as const;

export const updateEvents = {
  'updates:status': updateStatusSchema,
} as const;
