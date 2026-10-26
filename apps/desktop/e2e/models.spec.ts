import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { startFakeOpenAi } from './fake-openai';
import { createUserDataDir, launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

let app: ElectronApplication;
let page: Page;
let userDataDir: string;
let fake: Awaited<ReturnType<typeof startFakeOpenAi>>;

const provider = (name: string) => page.getByRole('listitem', { name });
const conversation = () => page.getByRole('log', { name: 'Conversation with the model' });

async function ask(text: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Message to the model' });
  await input.fill(text);
  await input.press('Enter');
}

test.beforeAll(async () => {
  fake = await startFakeOpenAi();
  userDataDir = createUserDataDir();
  app = await launchApp(userDataDir);
  page = await app.firstWindow();
  await stubOpenDialog(
    app,
    createProject({ 'src/a.ts': 'const answer = 1;\n', '.env': 'KEY=x\n' }),
  );
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await page.getByRole('tree', { name: 'Files' }).waitFor();
  await page.getByRole('button', { name: 'Models', exact: true }).click();
});

test.afterAll(async () => {
  await app.close();
  await fake.close();
});

test('adds a provider with a key that never reaches the window', async () => {
  await page.getByRole('button', { name: 'Add model provider' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add model provider' });
  await dialog.getByRole('radio', { name: 'Other' }).click();
  await dialog.getByLabel('Name').fill('Test endpoint');
  await dialog.getByLabel('Address').fill(fake.url);
  await dialog.getByLabel('Models').fill('busy-model\nfast-model\ncoder');
  await dialog.getByLabel('API key').fill('sk-test-key-123456789');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);

  await expect(provider('Test endpoint')).toContainText('then fast-model, coder');
  await provider('Test endpoint')
    .getByRole('button', { name: 'Test connection to Test endpoint' })
    .click();
  await expect(provider('Test endpoint')).toContainText('Connected · 3 models offered');
  expect(fake.requests.at(-1)?.authorization).toBe('Bearer sk-test-key-123456789');
  // The key is in the keychain store, not in the config file or the window.
  await expect(page.locator('body')).not.toContainText('sk-test-key');
  expect(readFileSync(join(userDataDir, 'providers.json'), 'utf8')).not.toContain('sk-test-key');
  // The first provider becomes the chat model.
  await expect(page.getByRole('contentinfo', { name: 'Status bar' })).toContainText('busy-model');
});

test('chats with streaming and falls back after a rate limit', async () => {
  await page.getByRole('radio', { name: 'Chat' }).click();
  await ask('hello there');
  await expect(conversation()).toContainText('busy-model: Rate limit reached. Trying fast-model.');
  await expect(conversation()).toContainText('Echo: hello there');
  await expect(conversation()).toContainText('fast-model');
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
});

test('stops an answer and keeps what arrived', async () => {
  await ask('slow');
  await expect(conversation()).toContainText('word1');
  await page.getByRole('button', { name: 'Stop answer' }).click();
  await expect(conversation()).toContainText('Stopped.');
  await expect(conversation()).not.toContainText('word199');
});

test('attaches the open file as marked data, but never secret files', async () => {
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.getByRole('tree', { name: 'Files' }).getByRole('treeitem', { name: '.env' }).click();
  await expect(page.getByRole('tab', { name: '.env', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Attach current file or selection' }).click();
  await expect(
    page.getByText('Secret files (e.g. .env or keys) are never sent to a model.'),
  ).toBeVisible();

  await page.getByRole('tree', { name: 'Files' }).getByRole('treeitem', { name: 'src' }).click();
  await page.getByRole('tree', { name: 'Files' }).getByRole('treeitem', { name: 'a.ts' }).click();
  await expect(page.getByTestId('monaco-editor')).toContainText('answer');
  await page.getByRole('button', { name: 'Attach current file or selection' }).click();
  await expect(page.getByRole('button', { name: 'Remove attachment' })).toBeVisible();
  await ask('explain');
  await expect(conversation()).toContainText('Echo: explain');
  const sent = JSON.stringify(fake.requests.at(-1)?.body);
  expect(sent).toContain('<attached-file path=\\"src/a.ts\\">');
  expect(sent).toContain('const answer = 1;');
});

test('shows earlier chats', async () => {
  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(conversation()).not.toContainText('Echo');
  await page.getByRole('button', { name: 'Earlier chats' }).click();
  await page.getByRole('menuitem', { name: 'hello there' }).click();
  await expect(conversation()).toContainText('Echo: hello there');
});

test('suggests code as ghost text with fill-in-the-middle', async () => {
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await page.getByLabel('Model', { exact: true }).selectOption({ label: 'coder' });
  await page.getByLabel('Suggest code while typing').check();

  const editor = page.getByTestId('monaco-editor');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('const x = ');
  await expect(editor.locator('[class*="ghost-text"]').first()).toContainText('42');
  await page.keyboard.press('Tab');
  await expect
    .poll(() =>
      editor
        .locator('.view-lines')
        .evaluate((node) => (node as unknown as { innerText: string }).innerText),
    )
    .toContain('const\u00a0x\u00a0=\u00a042');
  const fim = fake.requests.filter((request) => request.path === '/v1/completions').at(-1);
  expect(fim?.body).toMatchObject({
    model: 'coder',
    prompt: expect.stringContaining('const x = '),
  });
  // Saved, so closing the app does not ask about unsaved changes.
  await page.keyboard.press('Control+S');
  await expect(page.getByRole('tab', { name: 'a.ts', exact: true })).toBeVisible();
});
