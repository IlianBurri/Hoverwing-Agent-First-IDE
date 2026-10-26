import { z } from 'zod';
import { modelNameSchema } from './providers';

/** How models can be accelerated on this computer. */
export const backendSchema = z.enum(['cuda', 'rocm', 'metal', 'vulkan', 'cpu']);
export type Backend = z.infer<typeof backendSchema>;

export const gpuInfoSchema = z.object({
  vendor: z.string(),
  model: z.string(),
  /** Dedicated memory; null if unknown. */
  vramBytes: z.number().nullable(),
  /** Integrated GPU that shares the main memory. */
  shared: z.boolean(),
});
export type GpuInfo = z.infer<typeof gpuInfoSchema>;

export const hardwareInfoSchema = z.object({
  os: z.object({ platform: z.string(), name: z.string(), release: z.string(), arch: z.string() }),
  cpu: z.object({ name: z.string(), cores: z.number(), physicalCores: z.number() }),
  ramBytes: z.number(),
  gpus: z.array(gpuInfoSchema),
  backend: backendSchema,
  /** Free space where models are stored (home folder's drive); null if unknown. */
  diskFreeBytes: z.number().nullable(),
});
export type HardwareInfo = z.infer<typeof hardwareInfoSchema>;

export const modelPurposeSchema = z.enum(['completion', 'chat']);
export type ModelPurpose = z.infer<typeof modelPurposeSchema>;

export const catalogModelSchema = z.object({
  /** Ollama model name, e.g. "qwen2.5-coder:1.5b". */
  id: modelNameSchema,
  name: z.string().max(100),
  purpose: modelPurposeSchema,
  /** Download size. */
  sizeBytes: z.number().positive(),
  /** Memory needed to run it (weights + context). */
  memoryBytes: z.number().positive(),
  /** Supports fill-in-the-middle (completion models). */
  fim: z.boolean(),
  license: z.string().max(100),
});
export type CatalogModel = z.infer<typeof catalogModelSchema>;

/** The model catalog: a JSON file, updatable without a new app version. */
export const modelCatalogSchema = z.object({
  version: z.number().int().positive(),
  /** When the entries were last checked (YYYY-MM-DD). */
  checked: z.string().max(20),
  /** Where a newer catalog can be downloaded (https only). */
  updateUrl: z
    .string()
    .regex(/^https:\/\/[^\s]+$/)
    .nullable(),
  models: z.array(catalogModelSchema).max(200),
});
export type ModelCatalog = z.infer<typeof modelCatalogSchema>;

export const ollamaStatusSchema = z.object({
  /** The program was found on this computer. */
  installed: z.boolean(),
  /** The server answers. */
  running: z.boolean(),
  version: z.string().nullable(),
  /** Models that are already downloaded. */
  models: z.array(z.string()),
});
export type OllamaStatus = z.infer<typeof ollamaStatusSchema>;

/** What would be downloaded to install Ollama (shown before asking). */
export const installPlanSchema = z.object({
  version: z.string(),
  fileName: z.string(),
  url: z.string(),
  /** Release page on the official source. */
  source: z.string(),
  sizeBytes: z.number(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type InstallPlan = z.infer<typeof installPlanSchema>;

export const speedRatingSchema = z.enum(['fluid', 'usable', 'slow']);
export type SpeedRating = z.infer<typeof speedRatingSchema>;

export const benchmarkResultSchema = z.object({
  model: z.string(),
  tokensPerSecond: z.number(),
  rating: speedRatingSchema,
});
export type BenchmarkResult = z.infer<typeof benchmarkResultSchema>;

export const setupTaskIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);

/** Progress of a download (installer) or a model pull. */
export const setupProgressSchema = z.object({
  taskId: setupTaskIdSchema,
  status: z.enum(['running', 'verifying', 'done', 'failed', 'cancelled']),
  completed: z.number(),
  total: z.number(),
});
export type SetupProgress = z.infer<typeof setupProgressSchema>;

export interface MemoryBudget {
  bytes: number;
  /** Where models run: dedicated GPU memory, shared memory, or CPU only. */
  kind: 'gpu' | 'shared' | 'cpu';
}

/** Memory models may use, conservatively (the system and apps need some too). */
export function memoryBudget(hardware: HardwareInfo): MemoryBudget {
  if (hardware.backend === 'metal') return { bytes: hardware.ramBytes * 0.65, kind: 'shared' };
  if (hardware.backend !== 'cpu') {
    const dedicated = hardware.gpus
      .filter((gpu) => !gpu.shared && gpu.vramBytes !== null)
      .reduce((max, gpu) => Math.max(max, gpu.vramBytes ?? 0), 0);
    if (dedicated >= 2 * 1024 ** 3) return { bytes: dedicated * 0.9, kind: 'gpu' };
    if (hardware.gpus.some((gpu) => gpu.shared)) {
      return { bytes: hardware.ramBytes * 0.5, kind: 'shared' };
    }
  }
  return { bytes: hardware.ramBytes * 0.5, kind: 'cpu' };
}

/** CPU-only machines get small completion models, so typing stays fluid. */
const CPU_COMPLETION_LIMIT = 2.5 * 1024 ** 3;

export interface Recommendation {
  completion: CatalogModel | null;
  chat: CatalogModel | null;
  budget: MemoryBudget;
}

function largestFitting(
  models: readonly CatalogModel[],
  purpose: ModelPurpose,
  limit: number,
): CatalogModel | null {
  return (
    models
      .filter((model) => model.purpose === purpose && model.memoryBytes <= limit)
      .sort((a, b) => b.memoryBytes - a.memoryBytes)[0] ?? null
  );
}

/**
 * One model for autocompletion and one for chat that fit together into the
 * memory budget: completion gets at most a third, chat the rest.
 */
export function recommendModels(hardware: HardwareInfo, catalog: ModelCatalog): Recommendation {
  const budget = memoryBudget(hardware);
  const completionLimit = Math.min(
    budget.bytes / 3,
    budget.kind === 'cpu' ? CPU_COMPLETION_LIMIT : Infinity,
  );
  const completion = largestFitting(catalog.models, 'completion', completionLimit);
  const chat = largestFitting(
    catalog.models,
    'chat',
    budget.bytes - (completion?.memoryBytes ?? 0),
  );
  return { completion, chat, budget };
}

/** Tokens per second that feel fluid / usable, per purpose. */
const SPEED_LIMITS: Record<ModelPurpose, { fluid: number; usable: number }> = {
  completion: { fluid: 30, usable: 12 },
  chat: { fluid: 15, usable: 6 },
};

export function rateSpeed(purpose: ModelPurpose, tokensPerSecond: number): SpeedRating {
  const limits = SPEED_LIMITS[purpose];
  if (tokensPerSecond >= limits.fluid) return 'fluid';
  if (tokensPerSecond >= limits.usable) return 'usable';
  return 'slow';
}
