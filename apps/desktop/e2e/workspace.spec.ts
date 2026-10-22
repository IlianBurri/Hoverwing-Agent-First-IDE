import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp } from './launch';
import { createProject, stubOpenDialog, stubTrash } from './workspace-helpers';

let app: ElectronApplication;
let page: Page;
let root: string;

const tree = () => page.getByRole('tree', { name: 'Files' });
const item = (name: string) => tree().getByRole('treeitem', { name, exact: true });

test.beforeAll(async () => {
  root = createProject({
    'README.md': '# Demo\n',
    'src/index.ts': 'export {};\n',
    'src/util/math.ts': 'export const add = (a: number, b: number) => a + b;\n',
    'node_modules/pkg/index.js': '',
  });
  app = await launchApp();
  page = await app.firstWindow();
  await stubOpenDialog(app, root);
  await stubTrash(app, root);
});

test.afterAll(async () => {
  await app.close();
});

test('opens a folder and shows its files', async () => {
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await expect(item('src')).toBeVisible();
  await expect(item('README.md')).toBeVisible();
  await expect(item('node_modules')).toBeVisible();
  const name = root.split('/').pop() ?? '';
  await expect(page.getByRole('button', { name: 'Search commands' })).toContainText(name);
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()),
  ).toBe(`${name} — Kestrel`);
});

test('navigates the tree with the keyboard', async () => {
  await tree().focus();
  await expect(item('node_modules')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(item('src')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(item('src')).toHaveAttribute('aria-expanded', 'true');
  await expect(item('index.ts')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(item('util')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(item('src')).toHaveAttribute('aria-selected', 'true');
});

test('creates a file through the command palette', async () => {
  await page.keyboard.press('Control+K');
  await page.keyboard.type('New file');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'New file' });
  await expect(dialog).toBeVisible();
  await page.keyboard.type('index.ts');
  await expect(dialog.getByRole('alert')).toHaveText(
    'Something with this name already exists here.',
  );
  await page.keyboard.press('Control+A');
  await page.keyboard.type('app.ts');
  await page.keyboard.press('Enter');
  await expect(item('app.ts')).toHaveAttribute('aria-selected', 'true');
  expect(existsSync(join(root, 'src', 'app.ts'))).toBe(true);
});

test('renames with F2', async () => {
  await tree().focus();
  await page.keyboard.press('F2');
  const input = page.getByRole('dialog', { name: 'Rename' }).getByRole('textbox');
  await expect(input).toHaveValue('app.ts');
  // Only the name part is selected, so typing keeps the extension.
  await page.keyboard.type('main');
  await page.keyboard.press('Enter');
  await expect(item('main.ts')).toBeVisible();
  expect(existsSync(join(root, 'src', 'main.ts'))).toBe(true);
  expect(existsSync(join(root, 'src', 'app.ts'))).toBe(false);
});

test('picks up files created outside the app', async () => {
  writeFileSync(join(root, 'src', 'from-agent.ts'), '// written by someone else\n');
  await expect(item('from-agent.ts')).toBeVisible();
});

test('moves to trash only after confirmation', async () => {
  await item('from-agent.ts').click();
  await tree().focus();
  await page.keyboard.press('Delete');
  const dialog = page.getByRole('dialog', { name: /Move “from-agent.ts” to the trash/ });
  await expect(dialog).toBeVisible();
  // Cancel has focus by default: Enter must not delete.
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  expect(existsSync(join(root, 'src', 'from-agent.ts'))).toBe(true);

  await page.keyboard.press('Delete');
  await page.getByRole('button', { name: 'Move to trash' }).click();
  await expect(item('from-agent.ts')).toBeHidden();
  expect(existsSync(join(root, 'src', 'from-agent.ts'))).toBe(false);
  expect(readFileSync(join(`${root}-trash`, 'from-agent.ts'), 'utf8')).toContain('someone else');
});

test('offers file actions in the context menu', async () => {
  await item('README.md').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'File actions' });
  await expect(menu.getByRole('menuitem')).toHaveText([
    'New file',
    'New folder',
    'RenameF2',
    'Move to trashDel',
  ]);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  // Focus returns to the tree, so keyboard shortcuts keep working.
  await expect(tree()).toBeFocused();
});

test('reopens the folder from the recent list', async () => {
  await page.keyboard.press('Control+K');
  await page.keyboard.type('Close folder');
  await page.keyboard.press('Enter');
  await expect(page.getByText('No folder open')).toBeVisible();
  const name = root.split('/').pop() ?? '';
  await page
    .getByRole('navigation', { name: 'Recently opened' })
    .first()
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await expect(item('src')).toBeVisible();
});
