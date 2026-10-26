import { z } from 'zod';
import { providerConfigSchema } from '@kestrel/shared';
import type { ProviderConfig } from '@kestrel/shared';
import { readJsonFile, writeJsonFile } from '../../lib/jsonFile';

const providersSchema = z.array(providerConfigSchema);

/** Provider configurations in the app data folder (never in a project). */
export class ProviderConfigStore {
  private providers: ProviderConfig[] | null = null;

  constructor(private readonly file: string) {}

  async list(): Promise<ProviderConfig[]> {
    this.providers ??= await readJsonFile(this.file, providersSchema, []);
    return this.providers;
  }

  async get(id: string): Promise<ProviderConfig | undefined> {
    return (await this.list()).find((provider) => provider.id === id);
  }

  async save(config: ProviderConfig): Promise<void> {
    const providers = await this.list();
    const exists = providers.some((provider) => provider.id === config.id);
    await this.store(
      exists
        ? providers.map((provider) => (provider.id === config.id ? config : provider))
        : [...providers, config],
    );
  }

  async delete(id: string): Promise<void> {
    await this.store((await this.list()).filter((provider) => provider.id !== id));
  }

  private async store(providers: ProviderConfig[]): Promise<void> {
    this.providers = providers;
    await writeJsonFile(this.file, providers);
  }
}
