import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { agentConfigSchema } from '@kestrel/shared';
import type { AgentConfig } from '@kestrel/shared';
import { readJsonFile, writeJsonFile } from '../../lib/jsonFile';

/** Ready-made configurations. The agents themselves are installed by npx. */
export const AGENT_TEMPLATES: readonly AgentConfig[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'npx',
    args: ['-y', '@agentclientprotocol/claude-agent-acp@0.94.0'],
    env: [],
    reviewChanges: true,
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    command: 'npx',
    args: ['-y', '@google/gemini-cli@0.65.0', '--experimental-acp'],
    env: [],
    reviewChanges: true,
  },
];

const fileSchema = z.object({
  agents: z.array(agentConfigSchema),
  /** Fingerprints of command lines the user confirmed in a native dialog. */
  approved: z.array(z.string()),
});

/** Identifies an exact command line (program + arguments). */
export function commandFingerprint(config: Pick<AgentConfig, 'command' | 'args'>): string {
  return createHash('sha256')
    .update(JSON.stringify([config.command, ...config.args]))
    .digest('hex');
}

export class AgentConfigStore {
  private data: z.infer<typeof fileSchema> | null = null;
  private readonly file: string;

  constructor(dir: string) {
    this.file = join(dir, 'agents.json');
  }

  private async load() {
    this.data ??= await readJsonFile(this.file, fileSchema, {
      agents: [...AGENT_TEMPLATES],
      approved: [],
    });
    return this.data;
  }

  async list(): Promise<AgentConfig[]> {
    return (await this.load()).agents;
  }

  async get(id: string): Promise<AgentConfig | undefined> {
    return (await this.load()).agents.find((agent) => agent.id === id);
  }

  async save(config: AgentConfig): Promise<AgentConfig> {
    const data = await this.load();
    const exists = data.agents.some((agent) => agent.id === config.id);
    this.data = {
      ...data,
      agents: exists
        ? data.agents.map((agent) => (agent.id === config.id ? config : agent))
        : [...data.agents, config],
    };
    await writeJsonFile(this.file, this.data);
    return config;
  }

  async delete(id: string): Promise<void> {
    const data = await this.load();
    this.data = { ...data, agents: data.agents.filter((agent) => agent.id !== id) };
    await writeJsonFile(this.file, this.data);
  }

  async isApproved(config: AgentConfig): Promise<boolean> {
    return (await this.load()).approved.includes(commandFingerprint(config));
  }

  async approve(config: AgentConfig): Promise<void> {
    const data = await this.load();
    const fingerprint = commandFingerprint(config);
    if (data.approved.includes(fingerprint)) return;
    this.data = { ...data, approved: [...data.approved, fingerprint] };
    await writeJsonFile(this.file, this.data);
  }
}
