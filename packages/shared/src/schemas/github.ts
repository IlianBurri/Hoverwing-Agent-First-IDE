import { z } from 'zod';

/** "owner/name" as GitHub allows it (the clone URL is built from it in main). */
export const githubRepoNameSchema = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/)
  .refine((name) => !name.split('/').some((part) => part === '.' || part === '..'));

export const githubUserSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
});
export type GitHubUser = z.infer<typeof githubUserSchema>;

/** A running device-flow sign-in: the user enters `userCode` on GitHub. */
export const githubDeviceCodeSchema = z.object({
  userCode: z.string(),
  verificationUri: z.string(),
  expiresAt: z.number(),
});
export type GitHubDeviceCode = z.infer<typeof githubDeviceCodeSchema>;

export const githubStatusSchema = z.object({
  /** An OAuth client id is built in (or set for tests). */
  configured: z.boolean(),
  /** Signed-in account; the token itself never leaves main. */
  user: githubUserSchema.nullable(),
  signIn: githubDeviceCodeSchema.nullable(),
  /** Why the last sign-in ended without an account. */
  signInError: z.enum(['expired', 'denied', 'failed']).nullable(),
});
export type GitHubStatus = z.infer<typeof githubStatusSchema>;

export const githubRepoSchema = z.object({
  fullName: githubRepoNameSchema,
  description: z.string().nullable(),
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean(),
  /** ISO date of the last push or change. */
  updatedAt: z.string(),
});
export type GitHubRepo = z.infer<typeof githubRepoSchema>;
