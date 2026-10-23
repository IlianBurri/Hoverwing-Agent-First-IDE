import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { configureMockAgent, stubMessageBox } from './agent-helpers';
import { createUserDataDir, launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

let app: ElectronApplication;
let page: Page;
let root: string;

const read = (path: string) => readFileSync(join(root, path), 'utf8');
const changes = () => page.getByRole('region', { name: /to review/ });
const input = () => page.getByRole('textbox', { name: 'Message to the agent' });

async function send(text: string): Promise<void> {
  await input().fill(text);
  await input().press('Enter');
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
}

const thirtyLines =
  Array.from({ length: 30 }, (_, index) => `line ${String(index + 1)}`).join('\n') + '\n';

test.beforeAll(async () => {
  root = createProject({ 'src/app.ts': 'export const version = 1;\n', 'src/long.ts': thirtyLines });
  const userDataDir = createUserDataDir();
  configureMockAgent(userDataDir, { reviewChanges: true });
  app = await launchApp(userDataDir);
  page = await app.firstWindow();
  await stubOpenDialog(app, root);
  await stubMessageBox(app, 1);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(input()).toBeVisible();
});

test.afterAll(async () => {
  await app.close();
});

test('held changes do not touch the disk; rejecting keeps the file unchanged', async () => {
  await send('edit src/app.ts export const version = 2;');
  await expect(changes()).toContainText('1 change to review');
  await expect(changes()).toContainText('held back');
  expect(read('src/app.ts')).toBe('export const version = 1;\n');

  await changes().locator('button', { hasText: 'src/app.ts' }).click();
  await expect(page.getByRole('tab', { name: 'app.ts (Review)' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('review-diff')).toContainText('export const version = 2;');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();

  await expect(changes()).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'app.ts (Review)' })).toHaveCount(0);
  expect(read('src/app.ts')).toBe('export const version = 1;\n');
});

test('accepting a held change writes it', async () => {
  await send('edit src/app.ts export const version = 3;');
  await changes().getByRole('button', { name: 'Accept change to “src/app.ts”' }).click();
  await expect(changes()).toHaveCount(0);
  expect(read('src/app.ts')).toBe('export const version = 3;\n');
});

test('direct writes by the agent can be rejected after the turn', async () => {
  await send('direct src/app.ts export const version = 4;');
  expect(read('src/app.ts')).toBe('export const version = 4;\n');
  await expect(changes()).toContainText('already applied');
  await changes().getByRole('button', { name: 'Reject change to “src/app.ts”' }).click();
  await expect(changes()).toHaveCount(0);
  expect(read('src/app.ts')).toBe('export const version = 3;\n');
});

test('keeps only the selected sections of a change', async () => {
  await send('twohunks src/long.ts');
  await changes().locator('button', { hasText: 'src/long.ts' }).click();
  const sections = page.getByRole('group', { name: 'Sections' });
  await expect(sections.getByRole('checkbox')).toHaveCount(2);
  await sections.getByRole('checkbox').nth(1).uncheck();
  await page.getByRole('button', { name: 'Apply 1 of 2 sections' }).click();

  await expect(changes()).toHaveCount(0);
  const result = read('src/long.ts');
  expect(result).toContain('changed near the top');
  expect(result).not.toContain('changed near the bottom');
  expect(result).toContain('line 25');
});
