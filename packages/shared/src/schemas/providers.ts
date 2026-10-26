import { z } from 'zod';

export const providerIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);

export const providerTemplateSchema = z.enum(['openrouter', 'ollama', 'llamacpp', 'custom']);
export type ProviderTemplate = z.infer<typeof providerTemplateSchema>;

/** Model names as the endpoint knows them, e.g. "qwen2.5-coder:1.5b". */
export const modelNameSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^\s]+$/);

export const providerBaseUrlSchema = z
  .string()
  .max(2048)
  .regex(/^https?:\/\/[^\s]+$/);

export const providerConfigSchema = z.object({
  id: providerIdSchema,
  name: z.string().min(1).max(80),
  template: providerTemplateSchema,
  /** OpenAI-compatible endpoint, e.g. https://openrouter.ai/api/v1. */
  baseUrl: providerBaseUrlSchema,
  /** The first model is used; the others are fallbacks (rate limit, model missing). */
  models: z.array(modelNameSchema).min(1).max(10),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/** What the UI sees: never the API key, only whether one is stored. */
export const providerViewSchema = providerConfigSchema.extend({
  apiKeySet: z.boolean(),
});
export type ProviderView = z.infer<typeof providerViewSchema>;

/** Why a model request failed, in words the UI can translate. */
export const modelErrorKindSchema = z.enum([
  'unreachable',
  'auth',
  'rateLimited',
  'modelMissing',
  'badRequest',
  'server',
  'cancelled',
  'unknown',
]);
export type ModelErrorKind = z.infer<typeof modelErrorKindSchema>;

export const modelErrorSchema = z.object({
  kind: modelErrorKindSchema,
  /** Seconds to wait (rate limits), if the provider said so. */
  retryAfter: z.number().nullable(),
});
export type ModelError = z.infer<typeof modelErrorSchema>;

export interface ProviderTemplateInfo {
  template: ProviderTemplate;
  name: string;
  baseUrl: string;
  /** Example model, prefilled in the dialog. */
  model: string;
  needsKey: boolean;
  /** Runs on this computer (no data leaves it). */
  local: boolean;
}

export const providerTemplates: readonly ProviderTemplateInfo[] = [
  {
    template: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'qwen/qwen3-coder:free',
    needsKey: true,
    local: false,
  },
  {
    template: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5-coder:1.5b',
    needsKey: false,
    local: true,
  },
  {
    template: 'llamacpp',
    name: 'llama.cpp',
    baseUrl: 'http://localhost:8080/v1',
    model: 'default',
    needsKey: false,
    local: true,
  },
  {
    template: 'custom',
    name: '',
    baseUrl: 'https://',
    model: '',
    needsKey: true,
    local: false,
  },
];

/**
 * Free models (OpenRouter marks them ":free") may use prompts for training.
 * The UI shows a hint for them.
 */
export function isFreeModel(model: string): boolean {
  return model.endsWith(':free');
}

/** True for endpoints on this computer (localhost / loopback). */
export function isLocalEndpoint(baseUrl: string): boolean {
  return /^https?:\/\/(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\])(:\d+)?(\/|$)/i.test(
    baseUrl,
  );
}

/** A provider and one of its models, e.g. what the chat uses. */
export const modelRefSchema = z.object({
  providerId: providerIdSchema,
  model: modelNameSchema,
});
export type ModelRef = z.infer<typeof modelRefSchema>;
