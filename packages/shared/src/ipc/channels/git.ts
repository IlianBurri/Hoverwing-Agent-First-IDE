import { z } from 'zod';
import {
  gitBranchNameSchema,
  gitBranchSchema,
  gitDiffSchema,
  gitStatusSchema,
} from '../../schemas/git';
import { relativePathSchema } from '../../schemas/workspace';

const paths = z.object({ paths: z.array(relativePathSchema).min(1).max(10_000) });

/**
 * The Git panel, for the user only (agents have no access). One narrow
 * channel per action; there is no channel that runs arbitrary git commands.
 * Everything except reading the status needs a trusted project.
 */
export const gitChannels = {
  'git:status': { request: z.undefined(), response: gitStatusSchema },
  /** Both sides of a file: HEAD ↔ index (`staged`) or index ↔ work tree. */
  'git:diff': {
    request: z.object({ path: relativePathSchema, staged: z.boolean() }),
    response: gitDiffSchema,
  },
  'git:stage': { request: paths, response: z.null() },
  'git:unstage': { request: paths, response: z.null() },
  /** Drops work-tree changes; untracked files go to the trash. The UI confirms. */
  'git:discard': { request: paths, response: z.null() },
  'git:commit': {
    request: z.object({ message: z.string().trim().min(1).max(20_000) }),
    response: z.null(),
  },
  'git:branches': { request: z.undefined(), response: z.array(gitBranchSchema) },
  'git:checkout': { request: z.object({ branch: gitBranchNameSchema }), response: z.null() },
  'git:createBranch': { request: z.object({ name: gitBranchNameSchema }), response: z.null() },
  /** Creates a repository in the open folder. */
  'git:init': { request: z.undefined(), response: z.null() },
  'git:fetch': { request: z.undefined(), response: z.null() },
  'git:pull': { request: z.undefined(), response: z.null() },
  /** Pushes the current branch (sets the upstream if it has none). The UI confirms. */
  'git:push': { request: z.undefined(), response: z.null() },
} as const;

export const gitEvents = {
  /** HEAD, index or files changed: ask for the status again. */
  'git:changed': z.object({}),
  /** A line of git's output for Logs › Git. */
  'git:log': z.object({ line: z.string(), time: z.number() }),
} as const;
