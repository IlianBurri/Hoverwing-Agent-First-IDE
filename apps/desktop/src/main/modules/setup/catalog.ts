import { join } from 'node:path';
import { modelCatalogSchema } from '@kestrel/shared';
import type { ModelCatalog } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { readJsonFile, writeJsonFile } from '../../lib/jsonFile';
import defaultCatalogJson from './catalog.default.json';

/** The catalog shipped with the app (validated like a downloaded one). */
export const defaultCatalog: ModelCatalog = modelCatalogSchema.parse(defaultCatalogJson);

export type FetchText = (url: string) => Promise<string>;

/**
 * The model catalog: the shipped JSON, or a newer one the user downloaded
 * (stored in the app data folder). The newer version always wins.
 */
export class CatalogStore {
  private current: ModelCatalog | null = null;

  constructor(
    private readonly dir: string,
    private readonly fetchText: FetchText,
    private readonly shipped: ModelCatalog = defaultCatalog,
  ) {}

  private get file(): string {
    return join(this.dir, 'model-catalog.json');
  }

  async get(): Promise<ModelCatalog> {
    if (!this.current) {
      const stored = await readJsonFile<ModelCatalog | null>(this.file, modelCatalogSchema, null);
      this.current = stored && stored.version > this.shipped.version ? stored : this.shipped;
    }
    return this.current;
  }

  /** Downloads the catalog from its update address; keeps it if it is newer. */
  async update(): Promise<{ updated: boolean; catalog: ModelCatalog }> {
    const catalog = await this.get();
    if (!catalog.updateUrl) return { updated: false, catalog };
    let parsed: ModelCatalog;
    try {
      parsed = modelCatalogSchema.parse(JSON.parse(await this.fetchText(catalog.updateUrl)));
    } catch {
      throw new UserError('download_failed', 'The model catalog could not be downloaded.');
    }
    if (parsed.version <= catalog.version) return { updated: false, catalog };
    await writeJsonFile(this.file, parsed);
    this.current = parsed;
    return { updated: true, catalog: parsed };
  }
}
