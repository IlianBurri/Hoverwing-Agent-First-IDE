import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Windows starts Electron and PowerShell noticeably slower.
  timeout: process.platform === 'win32' ? 60_000 : 30_000,
  retries: process.env['CI'] ? 1 : 0,
  // Every test file starts its own Electron app; on Windows (PowerShell
  // start-up, file system) more than two at once makes timing tests flaky.
  ...(process.platform === 'win32' ? { workers: 2 } : {}),
  reporter: process.env['CI'] ? 'github' : 'list',
});
