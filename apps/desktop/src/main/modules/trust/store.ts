import { z } from 'zod';
import { readJsonFile, writeJsonFile } from '../../lib/jsonFile';

const fileSchema = z.object({ trusted: z.array(z.string()) });

/**
 * Folders the user trusts, in the app data folder (never in the project, so
 * a project cannot declare itself trusted). Roots are real paths as the
 * workspace manager stores them.
 */
export class TrustStore {
  private cache: Set<string> | null = null;
  private readonly listeners = new Set<(root: string, trusted: boolean) => void>();

  constructor(private readonly file: string) {}

  private async load(): Promise<Set<string>> {
    this.cache ??= new Set((await readJsonFile(this.file, fileSchema, { trusted: [] })).trusted);
    return this.cache;
  }

  async isTrusted(root: string): Promise<boolean> {
    return (await this.load()).has(root);
  }

  async set(root: string, trusted: boolean): Promise<void> {
    const roots = await this.load();
    if (roots.has(root) === trusted) return;
    if (trusted) roots.add(root);
    else roots.delete(root);
    await writeJsonFile(this.file, { trusted: [...roots].sort() });
    for (const listener of this.listeners) listener(root, trusted);
  }

  /** Called after trust of a folder changed. Returns an unsubscribe function. */
  onChange(listener: (root: string, trusted: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
