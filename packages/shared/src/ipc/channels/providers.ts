import { z } from 'zod';
import {
  providerConfigSchema,
  providerIdSchema,
  providerViewSchema,
} from '../../schemas/providers';

const byProvider = z.object({ id: providerIdSchema });

/** Model providers (OpenAI-compatible endpoints). API keys never leave main. */
export const providerChannels = {
  'providers:list': { request: z.undefined(), response: z.array(providerViewSchema) },
  /** Saves a provider; a changed address removes its stored API key. */
  'providers:save': { request: providerConfigSchema, response: providerViewSchema },
  'providers:delete': { request: byProvider, response: z.null() },
  /** Stores (or with null removes) the API key in the system keychain. */
  'providers:setApiKey': {
    request: byProvider.extend({ value: z.string().min(1).max(4096).nullable() }),
    response: z.null(),
  },
  /** Connects to the endpoint and lists the models it offers. */
  'providers:test': {
    request: byProvider,
    response: z.object({ models: z.array(z.string()) }),
  },
} as const;

export const providerEvents = {
  'providers:changed': z.object({}),
} as const;
