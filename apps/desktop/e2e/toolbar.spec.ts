import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { createUserDataDir, launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

let app: ElectronApplication;
let page: Page;
let userData: string;

const toolbar = () => page.getByRole('toolbar', { name: 'Toolbar' });
const settings = () =>
  JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) as { toolbar: string[] };

test.beforeAll(async () => {
  const root = realpathSync(createProject({ 'a.txt': 'a\n' }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  userData = createUserDataDir();
  writeFileSync(join(userData, 'trust.json'), JSON.stringify({ trusted: [root] }));
  app = await launchApp(userData);
  page = await app.firstWindow();
  await stubOpenDialog(app, root);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
});

test.afterAll(async () => {
  await app.close();
});

test('shows Pull and Push by default, enabled in a trusted repository', async () => {
  await expect(toolbar().getByRole('button', { name: 'Pull' })).toBeEnabled();
  await expect(toolbar().getByRole('button', { name: 'Push' })).toBeEnabled();
});

test('adds, reorders and removes commands in the dialog', async () => {
  await toolbar().getByRole('button', { name: 'Customize toolbar …' }).click();
  const dialog = page.getByRole('dialog', { name: 'Customize toolbar' });
  await dialog.getByRole('searchbox', { name: 'Search commands' }).fill('New terminal');
  await dialog.getByRole('button', { name: /^Add New terminal/ }).click();
  await expect(toolbar().getByRole('button', { name: /^New terminal/ })).toBeVisible();

  await dialog.getByRole('button', { name: /^Move New terminal.* left$/ }).click();
  await expect.poll(() => settings().toolbar.at(1)).toMatch(/terminal/);

  await dialog.getByRole('button', { name: 'Remove Pull' }).click();
  await expect(toolbar().getByRole('button', { name: 'Pull' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
});

test('removes a button from its context menu and restores the default', async () => {
  await toolbar().getByRole('button', { name: 'Push' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove from toolbar' }).click();
  await expect(toolbar().getByRole('button', { name: 'Push' })).toHaveCount(0);

  await toolbar().getByRole('button', { name: 'Customize toolbar …' }).click();
  const dialog = page.getByRole('dialog', { name: 'Customize toolbar' });
  await dialog.getByRole('button', { name: /Restore default/ }).click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => settings().toolbar).toEqual(['git.pull', 'git.push']);
});
