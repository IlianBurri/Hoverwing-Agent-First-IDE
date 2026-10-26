import { z } from 'zod';
import {
  chatAttachmentSchema,
  chatEventSchema,
  chatIdSchema,
  chatSchema,
  chatSummarySchema,
} from '../../schemas/chat';

/** The built-in chat with a model provider (no tools, no file access). */
export const chatChannels = {
  /**
   * Starts an answer; it arrives as chat:event. A new chat gets its id from
   * the window (so no event can arrive before the window knows the id).
   */
  'chat:send': {
    request: z.object({
      chatId: chatIdSchema,
      text: z.string().min(1).max(50_000),
      attachment: chatAttachmentSchema.nullable(),
    }),
    response: z.object({ chatId: chatIdSchema }),
  },
  /** Stops the answer that is being streamed. */
  'chat:stop': { request: z.undefined(), response: z.null() },
  'chat:list': { request: z.undefined(), response: z.array(chatSummarySchema) },
  'chat:load': { request: z.object({ id: chatIdSchema }), response: chatSchema },
  'chat:delete': { request: z.object({ id: chatIdSchema }), response: z.null() },
} as const;

export const chatEvents = {
  'chat:event': z.object({ chatId: chatIdSchema, event: chatEventSchema }),
} as const;
