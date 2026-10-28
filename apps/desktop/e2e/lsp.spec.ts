import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { stubMessageBox } from './agent-helpers';
import { createUserDataDir, launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

let app: ElectronApplication;
let page: Page;

const fakeServer = join(import.meta.dirname, 'fixtures', 'fake-lsp.mjs');
const statusBar = () => page.getByRole('contentinfo', { name: 'Status bar' });
const tree = () => page.getByRole('tree', { name: 'Files' });
const problemsTab = () => page.getByRole('tab', { name: /^Problems/ });

test.beforeAll(async () => {
  const root = createProject({
    'src/app.fake': 'const value = 1;\nlet broken = ERROR;\n',
    'readme.txt': 'no language server for this one\n',
  });
  const userData = createUserDataDir();
  mkdirSync(join(userData, 'lsp'));
  // The fake server, not yet confirmed: Hoverwing must ask before starting it.
  writeFileSync(
    join(userData, 'lsp', 'servers.json'),
    JSON.stringify({
      servers: [
        {
          id: 'fake',
          name: 'Fake LSP',
          command: process.execPath,
          args: [fakeServer],
          extensions: ['fake'],
          enabled: true,
        },
      ],
      approved: [],
    }),
  );
  app = await launchApp(userData);
  page = await app.firstWindow();
  await stubOpenDialog(app, root);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
});

test.afterAll(async () => {
  await app.close();
});

test('a new project starts in restricted mode without language servers', async () => {
  await expect(statusBar().getByRole('button', { name: 'Restricted mode' })).toBeVisible();
  await tree().getByRole('treeitem', { name: 'src', exact: true }).click();
  await tree().getByRole('treeitem', { name: 'app.fake', exact: true }).click();
  await page.keyboard.press('Control+Shift+M');
  await expect(page.getByText('Language servers only run in trusted projects.')).toBeVisible();
});

test('trusting the project starts the server after a native confirmation', async () => {
  // Both native questions (trust, then the server's command line) are confirmed.
  await stubMessageBox(app, 1);
  await statusBar().getByRole('button', { name: 'Restricted mode' }).click();
  await expect(statusBar().getByRole('button', { name: 'Restricted mode' })).toHaveCount(0);

  const problems = page.getByRole('region', { name: 'Problems' });
  await expect(problems.getByRole('button', { name: /Fake error/ })).toBeVisible();
  await expect(problemsTab()).toHaveText('Problems (1)');
  await expect(statusBar().getByRole('button', { name: '1 errors, 0 warnings' })).toBeVisible();
  // The error is underlined in the editor.
  await expect(page.getByTestId('monaco-editor').locator('.squiggly-error')).toHaveCount(1);
});

test('offers completions from the server', async () => {
  await page.getByTestId('monaco-editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nfa');
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.suggest-widget').getByText('fakeCompletion')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('updates diagnostics while typing', async () => {
  await page.getByTestId('monaco-editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nWARN');
  const problems = page.getByRole('region', { name: 'Problems' });
  await expect(problems.getByRole('button', { name: /Fake warning/ })).toBeVisible();
  await expect(problemsTab()).toHaveText('Problems (2)');
  // Saved, so closing the app does not stop at the "unsaved changes" dialog.
  await page.keyboard.press('Control+S');
  await expect(page.getByRole('tab', { name: 'app.fake', exact: true })).toBeVisible();
});

test('jumps to a problem from the list', async () => {
  const problems = page.getByRole('region', { name: 'Problems' });
  await problems.getByRole('button', { name: /Fake error/ }).click();
  // "ERROR" (line 2, columns 14–19) is selected; the cursor sits at its end.
  await expect(statusBar()).toContainText('Ln 2, Col 19');
});

test('shows the server output in the logs', async () => {
  await page.getByRole('tab', { name: 'Logs' }).click();
  await page.getByRole('radio', { name: 'Language servers' }).click();
  await expect(page.getByLabel('Language server output')).toContainText('fake-lsp started');
});

test('lists and edits language servers', async () => {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Language servers');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Language servers' });
  await expect(dialog.getByText('Fake LSP')).toBeVisible();
  await expect(dialog.getByText('TypeScript / JavaScript')).toBeVisible();
  await expect(dialog.getByText('Command line confirmed')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
});
