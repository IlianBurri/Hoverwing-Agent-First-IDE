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
  /** Opens a web link in the system browser. Only http(s) URLs are accepted. */
  'app:openExternalUrl': {
    request: z.object({
      url: z.url({ protocol: /^https?$/ }).max(2048),
    }),
    response: z.null(),
  },
  /** Writes text to the system clipboard (e.g. copy from the terminal). */
  'app:writeClipboard': {
    request: z.object({ text: z.string().max(10_000_000) }),
    response: z.null(),
  },
} as const;
