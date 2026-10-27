import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { startFakeOpenAi } from './fake-openai';
import { createUserDataDir, launchApp } from './launch';

let app: ElectronApplication;
let page: Page;
let fake: Awaited<ReturnType<typeof startFakeOpenAi>>;

const dialog = () => page.getByRole('dialog', { name: 'Customize layout with AI' });
const statusBar = () => page.getByRole('contentinfo', { name: 'Status bar' });
const toolbar = () => page.getByRole('toolbar', { name: 'Toolbar' });

async function openDialog(): Promise<void> {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('layout with AI');
  await page.keyboard.press('Enter');
  await expect(dialog()).toBeVisible();
}

async function wish(text: string): Promise<void> {
  await dialog().getByRole('textbox', { name: 'How do you want the IDE?' }).fill(text);
  await dialog().getByRole('button', { name: 'Propose layout' }).click();
}

test.beforeAll(async () => {
  fake = await startFakeOpenAi();
  const userData = createUserDataDir();
  // A local provider (no key) as chat model.
  writeFileSync(
    join(userData, 'providers.json'),
    JSON.stringify([
      { id: 'local', name: 'Local', template: 'custom', baseUrl: fake.url, models: ['fast-model'] },
    ]),
  );
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({ setupDone: true, chatModel: { providerId: 'local', model: 'fast-model' } }),
  );
  app = await launchApp(userData);
  page = await app.firstWindow();
  // Commands are registered once the shell is rendered.
  await expect(page.getByRole('toolbar', { name: 'Toolbar' })).toBeVisible();
});

test.afterAll(async () => {
  await app.close();
  await fake.close();
});

test('previews the proposal in plain words and changes nothing before applying', async () => {
  await openDialog();
  await wish('sidebar right, no status bar, a terminal button');
  const preview = dialog().getByRole('region', { name: 'Proposed changes' });
  await expect(preview).toContainText('Sidebar on the right, status bar hidden');
  await expect(preview).toContainText('Sidebar moves to the right');
  await expect(preview).toContainText('Status bar is hidden');
  await expect(preview).toContainText('Toolbar: + New terminal');
  // Unknown commands from the model are dropped.
  await expect(preview).not.toContainText('not.a.command');
  await expect(statusBar()).toBeVisible();

  const request = fake.requests.findLast((entry) => entry.path === '/v1/chat/completions');
  expect(JSON.stringify(request?.body)).toContain('json_object');
});

test('applies the layout and undoes it again', async () => {
  await dialog().getByRole('button', { name: 'Apply' }).click();
  await expect(dialog().getByText('Layout applied.')).toBeVisible();
  await expect(statusBar()).toHaveCount(0);
  await expect(toolbar().getByRole('button', { name: /^New terminal/ })).toBeVisible();

  await dialog().getByRole('button', { name: 'Undo' }).click();
  await expect(statusBar()).toBeVisible();
  await expect(toolbar().getByRole('button', { name: /^New terminal/ })).toHaveCount(0);
});

test('lets the model correct an invalid answer once', async () => {
  const before = fake.requests.length;
  await wish('broken first, please');
  await expect(dialog().getByRole('region', { name: 'Proposed changes' })).toContainText(
    'Status bar is hidden',
  );
  expect(
    fake.requests.slice(before).filter((entry) => entry.path === '/v1/chat/completions'),
  ).toHaveLength(2);
  await dialog().getByRole('button', { name: 'Discard' }).click();
  await expect(dialog().getByRole('region', { name: 'Proposed changes' })).toHaveCount(0);
  await expect(statusBar()).toBeVisible();
});
