import { execFileSync } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { createUserDataDir, launchApp } from './launch';
import { createProject, stubOpenDialog, stubTrash } from './workspace-helpers';

let app: ElectronApplication;
let page: Page;
let root: string;
let remote: string;

const env = {
  GIT_AUTHOR_NAME: 'Kestrel Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Kestrel Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });

const view = () => page.getByRole('complementary').or(page.locator('body'));
const section = (name: string) => page.getByRole('region', { name, exact: true });
const statusBar = () => page.getByRole('contentinfo', { name: 'Status bar' });

test.beforeAll(async () => {
  root = realpathSync(
    createProject({ 'a.txt': 'one\n', 'src/b.txt': 'b\n', '.gitignore': 'ignored/\n' }),
  );
  remote = `${root}-remote.git`;
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(root, 'remote', 'add', 'origin', remote);

  // Trusted from the start, so the panel can write.
  const userData = createUserDataDir();
  writeFileSync(join(userData, 'trust.json'), JSON.stringify({ trusted: [root] }));
  app = await launchApp(userData, env);
  page = await app.firstWindow();
  await stubOpenDialog(app, root);
  await stubTrash(app, root);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await page.keyboard.press('Control+Shift+G');
});

test.afterAll(async () => {
  await app.close();
});

test('shows the branch and a clean work tree', async () => {
  await expect(view().getByText('No changes.')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Branch' })).toHaveValue('main');
  await expect(
    statusBar().getByRole('button', { name: /Branch main, 0 changed files/ }),
  ).toBeVisible();
});

test('lists changes, marks them in the file tree and shows a diff', async () => {
  writeFileSync(join(root, 'a.txt'), 'one\ntwo\n');
  writeFileSync(join(root, 'new.txt'), 'new\n');
  await expect(
    section('Changes').getByRole('button', { name: 'a.txt', exact: true }),
  ).toBeVisible();
  await expect(
    section('Untracked').getByRole('button', { name: 'new.txt', exact: true }),
  ).toBeVisible();

  await section('Changes').getByRole('button', { name: 'a.txt', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'a.txt (changes)' });
  await expect(dialog.locator('.monaco-diff-editor')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('navigation').getByRole('button', { name: 'Files', exact: true }).click();
  await expect(
    page
      .getByRole('tree', { name: 'Files' })
      .getByRole('treeitem', { name: /^a\.txt/ })
      .getByLabel('Modified'),
  ).toBeVisible();
  await page.keyboard.press('Control+Shift+G');
});

test('stages and commits', async () => {
  await section('Changes').getByRole('button', { name: 'Stage a.txt' }).click();
  await expect(section('Staged').getByRole('button', { name: 'a.txt', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Commit message' }).fill('Add second line');
  await page.getByRole('button', { name: 'Commit 1 file' }).click();
  await expect(section('Staged')).toHaveCount(0);
  expect(git(root, 'log', '-1', '--format=%s').trim()).toBe('Add second line');
});

test('discards an untracked file into the trash after confirming', async () => {
  await section('Untracked').getByRole('button', { name: 'Discard changes in new.txt' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard changes' }).click();
  await expect(view().getByText('No changes.')).toBeVisible();
});

test('creates a branch and pushes it after confirming', async () => {
  await page.getByRole('button', { name: 'New branch …' }).click();
  await page.getByRole('textbox', { name: 'Branch name' }).fill('feature/demo');
  await page.getByRole('button', { name: 'Create branch' }).click();
  await expect(page.getByRole('combobox', { name: 'Branch' })).toHaveValue('feature/demo');

  await page.getByRole('button', { name: 'Push', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Push' }).click();
  await expect(page.getByText('Pushed.')).toBeVisible();
  expect(git(remote, 'branch', '--list', 'feature/demo').trim()).toContain('feature/demo');
});

test('switches back to main', async () => {
  await page.getByRole('combobox', { name: 'Branch' }).selectOption('main');
  await expect(statusBar().getByRole('button', { name: /Branch main/ })).toBeVisible();
});
