import { z } from 'zod';
import { relativePathSchema } from './workspace';

export const checkpointKindSchema = z.enum(['turn', 'manual', 'beforeRestore']);
export type CheckpointKind = z.infer<typeof checkpointKindSchema>;

export const checkpointSchema = z.object({
  /** Commit id in the shadow repository. */
  id: z.string().regex(/^[0-9a-f]{40,64}$/),
  time: z.number(),
  kind: checkpointKindSchema,
  /** E.g. the beginning of the prompt for agent turns. */
  label: z.string(),
  sessionId: z.string().nullable(),
});
export type Checkpoint = z.infer<typeof checkpointSchema>;

export const checkpointChangeSchema = z.object({
  path: relativePathSchema,
  status: z.enum(['added', 'modified', 'deleted']),
});
export type CheckpointChange = z.infer<typeof checkpointChangeSchema>;

export const checkpointStatusSchema = z.object({
  available: z.boolean(),
  reason: z.enum(['noGit', 'noWorkspace']).nullable(),
});
export type CheckpointStatus = z.infer<typeof checkpointStatusSchema>;
