import { join } from 'node:path';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';

/** Launches the built app (out/) the same way a user would. */
export function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    // Chromium refuses its OS sandbox when running as root (CI containers).
    args: [join(import.meta.dirname, '..'), ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
    env: { ...process.env, ELECTRON_RENDERER_URL: '' },
  });
}
