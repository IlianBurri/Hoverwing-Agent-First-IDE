import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';

export const MOCK_AGENT_NAME = 'Mock agent';

/** Configures the mock agent (and only it) in a user data folder. */
export function configureMockAgent(
  userDataDir: string,
  options: { reviewChanges?: boolean } = {},
): void {
  mkdirSync(userDataDir, { recursive: true });
  const config = {
    id: 'mock',
    name: MOCK_AGENT_NAME,
    command: process.execPath,
    args: [join(import.meta.dirname, 'fixtures', 'mock-agent.mjs')],
    env: [],
    reviewChanges: options.reviewChanges ?? false,
  };
  writeFileSync(
    join(userDataDir, 'agents.json'),
    JSON.stringify({ agents: [config], approved: [] }),
  );
}

/** Answers the native "start this agent?" dialog with the given button index. */
export async function stubMessageBox(app: ElectronApplication, response: number): Promise<void> {
  await app.evaluate(({ dialog }, answer) => {
    Object.assign(dialog, {
      showMessageBox: () => Promise.resolve({ response: answer, checkboxChecked: false }),
    });
  }, response);
}
