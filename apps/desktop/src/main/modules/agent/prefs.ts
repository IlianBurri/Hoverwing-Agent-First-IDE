import { join } from 'node:path';
import { z } from 'zod';
import type { AgentOptionValue } from '@kestrel/shared';
import { projectKey, readJsonFile, writeJsonFile } from '../../lib/jsonFile';

const prefsSchema = z.record(z.string(), z.record(z.string(), z.union([z.string(), z.boolean()])));
type Prefs = z.infer<typeof prefsSchema>;

/**
 * Session settings the user chose (model, effort …), per project and agent.
 * Lives in the app data folder, never in the project.
 */
export class AgentPrefsStore {
  constructor(private readonly dir: string) {}

  private file(root: string): string {
    return join(this.dir, `prefs-${projectKey(root)}.json`);
  }

  private read(root: string): Promise<Prefs> {
    return readJsonFile(this.file(root), prefsSchema, {});
  }

  async get(root: string, agentId: string): Promise<Record<string, AgentOptionValue>> {
    return (await this.read(root))[agentId] ?? {};
  }

  async set(
    root: string,
    agentId: string,
    optionId: string,
    value: AgentOptionValue,
  ): Promise<void> {
    const prefs = await this.read(root);
    prefs[agentId] = { ...prefs[agentId], [optionId]: value };
    await writeJsonFile(this.file(root), prefs);
  }
}
