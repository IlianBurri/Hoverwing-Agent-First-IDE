import { z } from 'zod';

const trustStateSchema = z.object({
  /** null: no folder is open. */
  trusted: z.boolean().nullable(),
});

/**
 * Project trust. Language servers and write actions of the Git panel only
 * run in trusted projects, because both can execute code from the project
 * (tsserver plugins, git hooks and filters). Granting trust is confirmed in
 * a native dialog, so a compromised renderer cannot trust a folder itself.
 */
export const trustChannels = {
  'trust:get': { request: z.undefined(), response: trustStateSchema },
  /** Asks natively; the response says whether the project is trusted now. */
  'trust:grant': { request: z.undefined(), response: trustStateSchema },
  'trust:revoke': { request: z.undefined(), response: trustStateSchema },
} as const;

export const trustEvents = {
  'trust:changed': trustStateSchema,
} as const;
