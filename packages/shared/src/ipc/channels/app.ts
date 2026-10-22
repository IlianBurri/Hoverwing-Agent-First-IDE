import { z } from 'zod';

export const appChannels = {
  'app:getInfo': {
    request: z.undefined(),
    response: z.object({
      name: z.string(),
      version: z.string(),
      platform: z.enum(['darwin', 'win32', 'linux', 'other']),
      locale: z.string(),
    }),
  },
} as const;
