import { z } from 'zod';

export const windowChannels = {
  /** Lets the native window controls (title bar overlay) follow the theme. */
  'window:setTitleBarTheme': {
    request: z.enum(['dark', 'light']),
    response: z.null(),
  },
} as const;
