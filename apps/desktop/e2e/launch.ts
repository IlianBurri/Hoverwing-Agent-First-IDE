import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';

/**
 * A fresh user data directory, so tests never share or touch real settings.
 * The setup assistant is marked as done unless a test wants the first start.
 */
export function createUserDataDir({ firstStart = false } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'kestrel-e2e-'));
  if (!firstStart) writeFileSync(join(dir, 'settings.json'), '{ "setupDone": true }\n');
  return dir;
}

/** Launches the built app (out/) the same way a user would, in English. */
export function launchApp(
  userDataDir = createUserDataDir(),
  env: Record<string, string> = {},
): Promise<ElectronApplication> {
  return electron.launch({
    args: [
      join(import.meta.dirname, '..'),
      '--lang=en-US',
      // Chromium refuses its OS sandbox when running as root (CI containers).
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
    ],
    env: {
      ...process.env,
      ...env,
      ELECTRON_RENDERER_URL: '',
      KESTREL_USER_DATA_DIR: userDataDir,
    },
  });
}
