import { z } from 'zod';

export const updateStatusSchema = z.object({
  state: z.enum([
    /** Development build, or checks switched off. */
    'disabled',
    'idle',
    'checking',
    'available',
    'upToDate',
    'downloading',
    /** Downloaded; installs on restart. */
    'ready',
    'error',
  ]),
  currentVersion: z.string(),
  /** The newer version (available / downloading / ready). */
  version: z.string().nullable(),
  /** Download progress 0–100. */
  percent: z.number().nullable(),
});
export type UpdateStatus = z.infer<typeof updateStatusSchema>;
