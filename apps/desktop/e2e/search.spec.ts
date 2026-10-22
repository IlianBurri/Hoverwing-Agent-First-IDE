import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

let app: ElectronApplication;
let page: Page;
let root: string;

const results = () => page.getByRole('list', { name: 'Search results' });

test.beforeAll(async () => {
  root = createProject({
    'src/a.ts': 'const oldName = 1;\nconsole.log(oldName);\n',
    'src/b.ts': 'export function OLDNAME() {}\n',
    'node_modules/dep/index.js': 'oldName\n',
  });
  app = await launchApp();
  page = await app.firstWindow();
  await stubOpenDialog(app, root);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await page.getByRole('tree', { name: 'Files' }).waitFor();
});

test.afterAll(async () => {
  await app.close();
});

test('searches the project with Ctrl+Shift+F', async () => {
  await page.keyboard.press('Control+Shift+F');
  await expect(page.getByRole('textbox', { name: 'Search' })).toBeFocused();
  await page.keyboard.type('oldName');
  await expect(page.getByRole('status').filter({ hasText: 'results' })).toHaveText(
    '3 results in 2 file(s)',
  );
  // node_modules is skipped.
  await expect(results().getByRole('button', { name: /index\.js/ })).toHaveCount(0);
});

test('narrows with match case', async () => {
  await page.getByRole('button', { name: 'Match case' }).click();
  await expect(page.getByText('2 results in 1 file(s)')).toBeVisible();
});

test('opens a result at the matching line', async () => {
  await results()
    .getByRole('button', { name: /Line 2: console\.log/ })
    .click();
  await expect(page.getByRole('tab', { name: 'a.ts' })).toHaveAttribute('aria-selected', 'true');
  // The match "oldName" (columns 13-19) is selected; the cursor sits at its end.
  await expect(page.getByRole('contentinfo', { name: 'Status bar' })).toContainText('Ln 2, Col 20');
});

test('shows a replace preview and replaces after confirmation', async () => {
  await page.getByRole('button', { name: 'Toggle replace' }).click();
  await page.getByRole('textbox', { name: 'Replace with' }).fill('newName');
  await expect(results().locator('ins').first()).toHaveText('newName');

  await page.getByRole('button', { name: 'Replace all' }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace 2 matches in 1 file(s)?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Replace all' }).click();
  await expect(page.getByText('Replaced 2 matches in 1 file(s).')).toBeVisible();
  expect(readFileSync(join(root, 'src', 'a.ts'), 'utf8')).toBe(
    'const newName = 1;\nconsole.log(newName);\n',
  );
  // The other file only matched case-insensitively and stays unchanged.
  expect(readFileSync(join(root, 'src', 'b.ts'), 'utf8')).toContain('OLDNAME');
});

test('reports invalid regular expressions', async () => {
  await page.getByRole('button', { name: 'Use regular expression' }).click();
  await page.getByRole('textbox', { name: 'Search' }).fill('(');
  await expect(page.getByText('The regular expression is invalid.')).toBeVisible();
});
