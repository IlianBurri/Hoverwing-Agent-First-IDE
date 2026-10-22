import { z } from 'zod';
import { settingsPatchSchema, settingsSchema } from '../../schemas/settings';

export const settingsChannels = {
  'settings:get': {
    request: z.undefined(),
    response: settingsSchema,
  },
  'settings:update': {
    request: settingsPatchSchema,
    response: settingsSchema,
  },
} as const;

export const settingsEvents = {
  'settings:changed': settingsSchema,
} as const;
