import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { agentConfigSchema, defaultAgentSandbox } from '@kestrel/shared';
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
    sandbox: defaultAgentSandbox,
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    command: 'npx',
    args: ['-y', '@google/gemini-cli@0.65.0', '--experimental-acp'],
    env: [],
    reviewChanges: true,
    sandbox: defaultAgentSandbox,
  },
];

const fileSchema = z.object({
  agents: z.array(agentConfigSchema),
  /** Fingerprints of command lines the user confirmed in a native dialog. */
  approved: z.array(z.string()),
});

/**
 * Identifies an exact command line (program + arguments) and where it runs:
 * switching an agent from the sandbox to the system needs a new approval.
 */
export function commandFingerprint(
  config: Pick<AgentConfig, 'command' | 'args' | 'sandbox'>,
): string {
  const line = [config.command, ...config.args];
  return createHash('sha256')
    .update(JSON.stringify(config.sandbox.enabled ? ['sandbox', ...line] : line))
    .digest('hex');
}

export class AgentConfigStore {
  private data: z.infer<typeof fileSchema> | null = null;
  private readonly file: string;

  /**
   * `sandboxByDefault` decides (once, when there is no agents.json yet)
   * whether the templates run in the sandbox: yes when Docker is available.
   */
  constructor(
    dir: string,
    private readonly sandboxByDefault: () => Promise<boolean> = () => Promise.resolve(false),
  ) {
    this.file = join(dir, 'agents.json');
  }

  private async load() {
    if (this.data) return this.data;
    const missing = { agents: [], approved: [] };
    const stored = await readJsonFile(this.file, fileSchema, missing);
    if (stored === missing) {
      const enabled = await this.sandboxByDefault().catch(() => false);
      this.data = {
        agents: AGENT_TEMPLATES.map((agent) => ({
          ...agent,
          sandbox: { ...agent.sandbox, enabled },
        })),
        approved: [],
      };
      // Stored right away, so the choice does not change on the next start.
      await writeJsonFile(this.file, this.data);
    } else {
      this.data = stored;
    }
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
