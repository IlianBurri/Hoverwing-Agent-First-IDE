import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';

export const MOCK_AGENT_NAME = 'Mock agent';

/** Configures the mock agent (and only it) in a user data folder. */
export function configureMockAgent(
  userDataDir: string,
  options: { reviewChanges?: boolean; sandbox?: { script: string } } = {},
): void {
  mkdirSync(userDataDir, { recursive: true });
  const config = {
    id: 'mock',
    name: MOCK_AGENT_NAME,
    // In the sandbox, the image's node runs the bundled script from the project.
    command: options.sandbox ? 'node' : process.execPath,
    args: [options.sandbox?.script ?? join(import.meta.dirname, 'fixtures', 'mock-agent.mjs')],
    env: [],
    reviewChanges: options.reviewChanges ?? false,
    sandbox: { enabled: options.sandbox !== undefined, memoryMb: 1024, cpus: 1 },
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

/**
 * Bundles the mock agent with its dependencies into one file, so it runs in
 * a sandbox container that only sees the project folder.
 */
export async function bundleMockAgent(outDir: string): Promise<string> {
  const { build } = await import('vite');
  await build({
    configFile: false,
    logLevel: 'silent',
    ssr: { noExternal: true, target: 'node' },
    build: {
      ssr: join(import.meta.dirname, 'fixtures', 'mock-agent.mjs'),
      outDir,
      emptyOutDir: true,
      rolldownOptions: { output: { entryFileNames: 'mock-agent.mjs', format: 'es' } },
    },
  });
  return join(outDir, 'mock-agent.mjs');
}
