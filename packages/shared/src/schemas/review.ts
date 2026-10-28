import { z } from 'zod';
import { relativePathSchema } from './workspace';

/** "held": not on disk yet (Kestrel held the write). "applied": the agent wrote it itself. */
export const reviewSourceSchema = z.enum(['held', 'applied']);

export const reviewFileSchema = z.object({
  path: relativePathSchema,
  status: z.enum(['added', 'modified', 'deleted']),
  source: reviewSourceSchema,
  additions: z.number().int(),
  deletions: z.number().int(),
  hunks: z.number().int(),
  /** Names of the agents that changed the file (several in parallel sessions). */
  agents: z.array(z.string()),
});
export type ReviewFile = z.infer<typeof reviewFileSchema>;

export const reviewHunkSchema = z.object({
  index: z.number().int(),
  oldStart: z.number().int(),
  oldLines: z.number().int(),
  newStart: z.number().int(),
  newLines: z.number().int(),
  /** Diff lines with "+", "-" or " " prefix. */
  lines: z.array(z.string()),
});
export type ReviewHunk = z.infer<typeof reviewHunkSchema>;

export const reviewDiffSchema = z.object({
  path: relativePathSchema,
  source: reviewSourceSchema,
  /** null = the file did not exist before / will not exist after. */
  original: z.string().nullable(),
  proposed: z.string().nullable(),
  hunks: z.array(reviewHunkSchema),
});
export type ReviewDiff = z.infer<typeof reviewDiffSchema>;

/** Which hunks to keep: all, none, or the listed indexes. */
export const hunkSelectionSchema = z.union([
  z.literal('all'),
  z.literal('none'),
  z.array(z.number().int().nonnegative()).max(10_000),
]);
export type HunkSelection = z.infer<typeof hunkSelectionSchema>;
