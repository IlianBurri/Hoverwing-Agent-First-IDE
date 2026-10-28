import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { createUserDataDir } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

/**
 * Smoke test of the packaged app (release/win-unpacked, after
 * `pnpm package`): native modules and ripgrep must work outside the asar.
 * Skipped when no packaged build exists.
 */
const executable = join(import.meta.dirname, '..', 'release', 'win-unpacked', 'Hoverwing.exe');

test.skip(process.platform !== 'win32' || !existsSync(executable), 'no packaged Windows build');

test('the installed app searches, opens terminals and detects hardware', async () => {
  test.setTimeout(90_000);
  const app = await electron.launch({
    executablePath: executable,
    args: ['--lang=en-US'],
    env: { ...process.env, KESTREL_USER_DATA_DIR: createUserDataDir() },
  });
  const page = await app.firstWindow();
  await stubOpenDialog(app, createProject({ 'src/hello.ts': 'export const needle = 1;\n' }));
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await page.getByRole('tree', { name: 'Files' }).waitFor();

  // ripgrep runs from app.asar.unpacked.
  await page.keyboard.press('Control+Shift+F');
  await page.getByRole('textbox', { name: 'Search' }).fill('needle');
  await expect(page.getByText('hello.ts').first()).toBeVisible();

  // node-pty works.
  await page.keyboard.press('Control+`');
  await expect(page.getByRole('tablist', { name: 'Terminals' }).getByRole('tab')).toHaveCount(1);

  // systeminformation works in the packaged app.
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await page.getByRole('button', { name: 'Setup assistant' }).click();
  const wizard = page.getByRole('dialog', { name: 'Set up local models' });
  await wizard.getByRole('button', { name: 'Start' }).click();
  await expect(wizard.getByText('Memory', { exact: true })).toBeVisible({ timeout: 30_000 });
  await app.close();
});
