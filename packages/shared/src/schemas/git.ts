import { z } from 'zod';
import { relativePathSchema } from './workspace';

export const gitChangeKindSchema = z.enum([
  'added',
  'modified',
  'deleted',
  'renamed',
  'copied',
  'typeChanged',
  'untracked',
]);
export type GitChangeKind = z.infer<typeof gitChangeKindSchema>;

export const gitFileSchema = z.object({
  path: relativePathSchema,
  /** Previous path of a rename or copy. */
  origPath: relativePathSchema.nullable(),
  /** Change in the index (staged), or null. */
  staged: gitChangeKindSchema.nullable(),
  /** Change in the work tree (not staged), or null. */
  unstaged: gitChangeKindSchema.nullable(),
  /** Unmerged (merge or rebase conflict). */
  conflict: z.boolean(),
});
export type GitFile = z.infer<typeof gitFileSchema>;

export const gitStatusSchema = z.discriminatedUnion('state', [
  /** git is not installed. */
  z.object({ state: z.literal('unavailable') }),
  /** The open folder is not inside a Git repository. */
  z.object({ state: z.literal('noRepo') }),
  z.object({
    state: z.literal('repo'),
    /** null: detached HEAD. */
    branch: z.string().nullable(),
    /** Short commit id, null before the first commit. */
    head: z.string().nullable(),
    upstream: z.string().nullable(),
    ahead: z.number().int(),
    behind: z.number().int(),
    files: z.array(gitFileSchema),
    /** The repository root is above the open folder: paths are still project-relative. */
    nested: z.boolean(),
  }),
]);
export type GitStatus = z.infer<typeof gitStatusSchema>;

export const gitBranchSchema = z.object({
  name: z.string(),
  current: z.boolean(),
  /** Exists only on a remote (checking it out creates a local branch). */
  remoteOnly: z.boolean(),
});
export type GitBranch = z.infer<typeof gitBranchSchema>;

/** Branch names Hoverwing accepts (a safe subset of git's rules, never an option). */
export const gitBranchNameSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)[A-Za-z0-9._/-]+(?<![./])$/)
  .refine((name) => !name.endsWith('.lock'), 'Invalid branch name.');

/** Text of both sides for the diff editor; null = missing or not text. */
export const gitDiffSchema = z.object({
  original: z.string().nullable(),
  modified: z.string().nullable(),
});
export type GitDiff = z.infer<typeof gitDiffSchema>;
