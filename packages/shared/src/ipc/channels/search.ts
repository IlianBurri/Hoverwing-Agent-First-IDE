import { z } from 'zod';
import {
  replaceRequestSchema,
  replaceResultSchema,
  searchOptionsSchema,
  searchResultSchema,
} from '../../schemas/search';

export const searchChannels = {
  /** Searches the open workspace; a new search cancels the previous one. */
  'search:find': { request: searchOptionsSchema, response: searchResultSchema },
  'search:cancel': { request: z.undefined(), response: z.null() },
  /** Replaces all matches in the given files (the UI asks for confirmation). */
  'search:replace': { request: replaceRequestSchema, response: replaceResultSchema },
} as const;
