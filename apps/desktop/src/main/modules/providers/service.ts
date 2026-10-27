import type { ModelRef, ProviderConfig, ProviderTemplate, ProviderView } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import type { SecretStore } from '../secrets';
import type { CreateModelClient, ModelClient } from './client';
import type { ProviderConfigStore } from './configs';
import { classifyModelError, toProviderUserError } from './errors';

export interface ProviderServiceDeps {
  configs: Pick<ProviderConfigStore, 'list' | 'get' | 'save' | 'delete'>;
  secrets: Pick<SecretStore, 'get' | 'set' | 'has'>;
  createClient: CreateModelClient;
  onChanged: () => void;
}

const TEST_TIMEOUT_MS = 15_000;

const keyOf = (id: string) => `provider:${id}`;

/** Model providers: configurations, API keys (keychain) and clients. */
export class ProviderService {
  constructor(private readonly deps: ProviderServiceDeps) {}

  private async view(config: ProviderConfig): Promise<ProviderView> {
    return { ...config, apiKeySet: await this.deps.secrets.has(keyOf(config.id)) };
  }

  private async require(id: string): Promise<ProviderConfig> {
    const config = await this.deps.configs.get(id);
    if (!config) throw new UserError('not_found', 'Unknown provider.');
    return config;
  }

  private async client(config: ProviderConfig): Promise<ModelClient> {
    const apiKey = await this.deps.secrets.get(keyOf(config.id));
    return this.deps.createClient({ baseUrl: config.baseUrl, apiKey });
  }

  async list(): Promise<ProviderView[]> {
    return Promise.all((await this.deps.configs.list()).map((config) => this.view(config)));
  }

  async save(config: ProviderConfig): Promise<ProviderView> {
    const previous = await this.deps.configs.get(config.id);
    // A key belongs to the address it was entered for: never send it
    // somewhere else (e.g. after a compromised window changed the URL).
    if (previous && previous.baseUrl !== config.baseUrl) {
      await this.deps.secrets.set(keyOf(config.id), null);
    }
    await this.deps.configs.save(config);
    this.deps.onChanged();
    return this.view(config);
  }

  async delete(id: string): Promise<void> {
    await this.deps.configs.delete(id);
    await this.deps.secrets.set(keyOf(id), null);
    this.deps.onChanged();
  }

  async setApiKey(id: string, value: string | null): Promise<void> {
    await this.require(id);
    await this.deps.secrets.set(keyOf(id), value === null ? null : value.trim());
    this.deps.onChanged();
  }

  /** Connects and lists the endpoint's models. */
  async test(id: string): Promise<{ models: string[] }> {
    const client = await this.client(await this.require(id));
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, TEST_TIMEOUT_MS);
    try {
      return { models: (await client.listModels(controller.signal)).sort() };
    } catch (error) {
      if (controller.signal.aborted) {
        throw toProviderUserError({ kind: 'unreachable', retryAfter: null });
      }
      throw toProviderUserError(classifyModelError(error));
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Client and model order for a request: the chosen model first, then the
   * provider's other models as fallbacks.
   */
  async resolve(
    ref: ModelRef,
  ): Promise<{ client: ModelClient; models: string[]; template?: ProviderTemplate }> {
    const config = await this.require(ref.providerId);
    return {
      client: await this.client(config),
      models: [ref.model, ...config.models.filter((model) => model !== ref.model)],
      template: config.template,
    };
  }
}
