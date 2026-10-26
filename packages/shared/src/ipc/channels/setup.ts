import { z } from 'zod';
import { modelNameSchema } from '../../schemas/providers';
import {
  benchmarkResultSchema,
  hardwareInfoSchema,
  installPlanSchema,
  modelCatalogSchema,
  modelPurposeSchema,
  ollamaStatusSchema,
  setupProgressSchema,
  setupTaskIdSchema,
} from '../../schemas/setup';

/** The setup assistant: hardware, model catalog, local runtime (Ollama). */
export const setupChannels = {
  /** Detected once per app start (takes a few seconds). */
  'setup:hardware': { request: z.undefined(), response: hardwareInfoSchema },
  'setup:catalog': { request: z.undefined(), response: modelCatalogSchema },
  /** Downloads a newer catalog from the catalog's update address. */
  'setup:updateCatalog': {
    request: z.undefined(),
    response: z.object({ updated: z.boolean(), catalog: modelCatalogSchema }),
  },
  'setup:ollamaStatus': { request: z.undefined(), response: ollamaStatusSchema },
  /** The official installer for this system, or null (install by hand). */
  'setup:installPlan': { request: z.undefined(), response: installPlanSchema.nullable() },
  /**
   * Downloads the installer, checks its SHA-256 and, after a native
   * confirmation, starts it. Progress arrives as setup:progress.
   */
  'setup:installOllama': {
    request: z.object({ taskId: setupTaskIdSchema }),
    response: z.object({ started: z.boolean() }),
  },
  /** Downloads a model with Ollama. Progress arrives as setup:progress. */
  'setup:pullModel': {
    request: z.object({ taskId: setupTaskIdSchema, model: modelNameSchema }),
    response: z.null(),
  },
  'setup:cancel': { request: z.object({ taskId: setupTaskIdSchema }), response: z.null() },
  /** Short speed test of a downloaded model (tokens per second). */
  'setup:benchmark': {
    request: z.object({ model: modelNameSchema, purpose: modelPurposeSchema }),
    response: benchmarkResultSchema,
  },
  /** Adds the local Ollama provider and uses the models for chat/completion. */
  'setup:apply': {
    request: z.object({
      completion: modelNameSchema.nullable(),
      chat: modelNameSchema.nullable(),
    }),
    response: z.null(),
  },
} as const;

export const setupEvents = {
  'setup:progress': setupProgressSchema,
} as const;
