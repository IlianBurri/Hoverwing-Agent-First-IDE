import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { permissionRuleSchema } from '@kestrel/shared';
import type { PermissionRule } from '@kestrel/shared';
import { projectKey, readJsonFile, writeJsonFile } from '../../lib/jsonFile';

const fileSchema = z.array(permissionRuleSchema);

/**
 * Permission rules live in the app data folder, never in the project, so an
 * agent cannot grant itself permissions by editing a file.
 */
export class RuleStore {
  private readonly cache = new Map<string, PermissionRule[]>();

  constructor(private readonly dir: string) {}

  private file(root: string | null): string {
    return join(this.dir, root === null ? 'global.json' : `project-${projectKey(root)}.json`);
  }

  private async load(root: string | null): Promise<PermissionRule[]> {
    const path = this.file(root);
    const cached = this.cache.get(path);
    if (cached) return cached;
    const rules = await readJsonFile(path, fileSchema, []);
    this.cache.set(path, rules);
    return rules;
  }

  /** Rules that apply in a project: its own plus the global ones. */
  async rulesFor(root: string | null): Promise<PermissionRule[]> {
    const global = await this.load(null);
    return root === null ? global : [...(await this.load(root)), ...global];
  }

  async add(
    root: string | null,
    rule: Omit<PermissionRule, 'id' | 'createdAt'>,
  ): Promise<PermissionRule> {
    const target = rule.scope === 'global' ? null : root;
    const rules = await this.load(target);
    const existing = rules.find(
      (entry) =>
        entry.kind === rule.kind && entry.pattern === rule.pattern && entry.level === rule.level,
    );
    if (existing) return existing;
    const created: PermissionRule = { ...rule, id: randomUUID(), createdAt: Date.now() };
    const next = [...rules, created];
    this.cache.set(this.file(target), next);
    await writeJsonFile(this.file(target), next);
    return created;
  }

  async delete(root: string | null, id: string): Promise<void> {
    for (const target of root === null ? [null] : [root, null]) {
      const rules = await this.load(target);
      if (!rules.some((rule) => rule.id === id)) continue;
      const next = rules.filter((rule) => rule.id !== id);
      this.cache.set(this.file(target), next);
      await writeJsonFile(this.file(target), next);
    }
  }
}
