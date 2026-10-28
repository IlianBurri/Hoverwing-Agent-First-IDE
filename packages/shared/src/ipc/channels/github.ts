import { z } from 'zod';
import {
  githubDeviceCodeSchema,
  githubRepoNameSchema,
  githubRepoSchema,
  githubStatusSchema,
} from '../../schemas/github';
import { workspaceInfoSchema } from '../../schemas/workspace';

/**
 * GitHub account (OAuth device flow) and its repositories. The token stays in
 * main; git gets it for the GitHub host only, through a credential helper.
 */
export const githubChannels = {
  'github:status': { request: z.undefined(), response: githubStatusSchema },
  /** Starts the device flow and opens GitHub's code page in the browser. */
  'github:signIn': { request: z.undefined(), response: githubDeviceCodeSchema },
  'github:cancelSignIn': { request: z.undefined(), response: z.null() },
  /** Forgets the token (revoking it is done on GitHub). */
  'github:signOut': { request: z.undefined(), response: z.null() },
  'github:repos': { request: z.undefined(), response: z.array(githubRepoSchema) },
  /** Asks for a parent folder natively, clones there and opens the copy (null: cancelled). */
  'github:clone': {
    request: z.object({ fullName: githubRepoNameSchema }),
    response: workspaceInfoSchema.nullable(),
  },
} as const;

export const githubEvents = {
  'github:changed': githubStatusSchema,
} as const;
