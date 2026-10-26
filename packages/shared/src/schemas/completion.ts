import { z } from 'zod';
import { modelErrorKindSchema, modelRefSchema } from './providers';

/** Fill-in-the-middle: "auto" tries it and falls back to a chat prompt. */
export const fimModeSchema = z.enum(['auto', 'on', 'off']);
export type FimMode = z.infer<typeof fimModeSchema>;

export const completionSettingsSchema = z.object({
  enabled: z.boolean(),
  model: modelRefSchema.nullable(),
  fim: fimModeSchema,
  /** Monaco language ids without suggestions, e.g. "markdown". */
  disabledLanguages: z.array(z.string().max(100)).max(200),
});
export type CompletionSettings = z.infer<typeof completionSettingsSchema>;

export const defaultCompletionSettings: CompletionSettings = {
  enabled: false,
  model: null,
  fim: 'auto',
  disabledLanguages: ['markdown', 'plaintext'],
};

/** Context sent for one suggestion (already shortened by the renderer). */
export const completionRequestSchema = z.object({
  requestId: z.number().int().nonnegative(),
  /** Relative to the project; used to skip secret files. */
  path: z.string().max(4096),
  language: z.string().max(100),
  prefix: z.string().max(20_000),
  suffix: z.string().max(10_000),
});
export type CompletionRequest = z.infer<typeof completionRequestSchema>;

export const completionResultSchema = z.object({
  text: z.string(),
  /** Why there is no suggestion (null = none needed or simply empty). */
  error: modelErrorKindSchema.nullable(),
});
export type CompletionResult = z.infer<typeof completionResultSchema>;

/** Characters of context sent around the cursor. */
export const COMPLETION_PREFIX_CHARS = 4000;
export const COMPLETION_SUFFIX_CHARS = 1000;
