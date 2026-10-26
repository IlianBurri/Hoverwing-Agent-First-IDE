import { z } from 'zod';
import { modelErrorSchema, modelNameSchema } from './providers';

export const chatIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);

/** A file (or part of it) the user attached to a chat message. */
export const chatAttachmentSchema = z.object({
  /** Relative to the project. */
  path: z.string().min(1).max(4096),
  language: z.string().max(100),
  /** Line range of a selection, or null for the whole file. */
  lines: z.object({ start: z.number().int().min(1), end: z.number().int().min(1) }).nullable(),
  text: z.string().max(100_000),
});
export type ChatAttachment = z.infer<typeof chatAttachmentSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  attachment: chatAttachmentSchema.nullable(),
  /** Which model answered (assistant messages). */
  model: z.string().nullable(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatSchema = z.object({
  id: chatIdSchema,
  title: z.string(),
  time: z.number(),
  messages: z.array(chatMessageSchema),
});
export type Chat = z.infer<typeof chatSchema>;

export const chatSummarySchema = chatSchema.pick({ id: true, title: true, time: true });
export type ChatSummary = z.infer<typeof chatSummarySchema>;

/** Streaming events of one chat answer. */
export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), model: modelNameSchema }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  /** The model could not answer; the next one of the list is tried. */
  z.object({
    type: z.literal('fallback'),
    from: modelNameSchema,
    to: modelNameSchema,
    error: modelErrorSchema,
  }),
  z.object({ type: z.literal('done'), stopped: z.boolean() }),
  z.object({ type: z.literal('error'), error: modelErrorSchema }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;
