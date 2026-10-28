import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

let app: ElectronApplication;
let page: Page;
let root: string;
const problems: string[] = [];

const tree = () => page.getByRole('tree', { name: 'Files' });
const tab = (name: string) =>
  page.getByRole('tablist', { name: 'Open files' }).getByRole('tab', { name, exact: true });
const editorText = () =>
  page
    .getByTestId('monaco-editor')
    .locator('.view-lines')
    .evaluate((node) =>
      // Monaco renders spaces as non-breaking spaces.
      (node as unknown as { innerText: string }).innerText.replace(/\u00a0/g, ' '),
    );

test.beforeAll(async () => {
  root = createProject({
    'src/index.ts': 'export const greeting = "hello";\n',
    'src/other.ts': 'const value = 1;\n',
    'notes.md': '# Notes\nTODO: write docs\n',
    'image.png': '\u0000\u0001binary',
  });
  app = await launchApp();
  page = await app.firstWindow();
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await stubOpenDialog(app, root);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await tree().getByRole('treeitem', { name: 'src', exact: true }).click();
});

test.afterAll(async () => {
  await app.close();
});

test('opens a file in a tab with syntax highlighting', async () => {
  await tree().getByRole('treeitem', { name: 'index.ts', exact: true }).click();
  await expect(tab('index.ts')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(editorText).toContain('export const greeting = "hello";');
  await expect(page.getByRole('contentinfo', { name: 'Status bar' })).toContainText('typescript');
  // Tokens are coloured, i.e. the TypeScript grammar is active.
  await expect(
    page.getByTestId('monaco-editor').locator('.view-line span span').first(),
  ).toHaveClass(/mtk\d+/);
});

test('marks unsaved changes and saves with Ctrl+S', async () => {
  await page.getByTestId('monaco-editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('export const answer = 42;');
  await expect(tab('index.ts (unsaved)')).toBeVisible();
  await page.keyboard.press('Control+S');
  await expect(tab('index.ts')).toBeVisible();
  expect(readFileSync(join(root, 'src', 'index.ts'), 'utf8')).toContain('answer = 42');
});

test('follows changes on disk when there are no unsaved edits', async () => {
  writeFileSync(join(root, 'src', 'index.ts'), 'export const fromAgent = true;\n');
  await expect.poll(editorText).toContain('fromAgent = true');
});

test('warns instead of overwriting unsaved edits when the file changes on disk', async () => {
  await page.getByTestId('monaco-editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('// my edit');
  writeFileSync(join(root, 'src', 'index.ts'), 'export const fromAgent = "again";\n');
  await expect(
    page.getByText('The file was changed outside while you have unsaved changes.'),
  ).toBeVisible();
  await expect.poll(editorText).toContain('// my edit');

  // Saving now would overwrite the other change: Hoverwing asks first.
  await page.getByRole('button', { name: 'Keep my version' }).click();
  await page.keyboard.press('Control+S');
  await expect(tab('index.ts')).toBeVisible();
  expect(readFileSync(join(root, 'src', 'index.ts'), 'utf8')).toContain('// my edit');
});

test('asks before closing a tab with unsaved changes', async () => {
  await page.getByTestId('monaco-editor').click();
  await page.keyboard.type('x');
  await page.keyboard.press('Control+W');
  const dialog = page.getByRole('dialog', { name: /Save changes to “index.ts”/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Don’t save' }).click();
  await expect(tab('index.ts')).toBeHidden();
  expect(readFileSync(join(root, 'src', 'index.ts'), 'utf8')).not.toMatch(/x$/);
});

test('shows a notice for binary files', async () => {
  await tree().getByRole('treeitem', { name: 'image.png', exact: true }).click();
  await expect(page.getByText('Binary file')).toBeVisible();
});

test('switches tabs with Ctrl+Tab and keeps each file', async () => {
  await tree().getByRole('treeitem', { name: 'other.ts', exact: true }).click();
  await expect.poll(editorText).toContain('const value = 1;');
  await page.keyboard.press('Control+Tab');
  await expect(tab('image.png')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Control+Tab');
  await expect(tab('other.ts')).toHaveAttribute('aria-selected', 'true');
});

test('logs no errors (e.g. CSP violations from Monaco workers)', () => {
  expect(problems).toEqual([]);
});
