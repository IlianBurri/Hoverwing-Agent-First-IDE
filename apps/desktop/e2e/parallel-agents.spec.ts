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

const tabs = () => page.getByRole('tablist', { name: 'Agents' }).getByRole('tab');
const conversation = () => page.getByRole('log', { name: 'Conversation with the agent' });
const input = () => page.getByRole('textbox', { name: 'Message to the agent' });
const changes = () => page.getByRole('region', { name: /to review/ });
const statusBar = () => page.getByRole('contentinfo', { name: 'Status bar' });
const read = (path: string) => readFileSync(join(root, path), 'utf8');

async function send(text: string): Promise<void> {
  await input().fill(text);
  await input().press('Enter');
}

async function turnDone(): Promise<void> {
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
}

async function startInActiveTab(): Promise<void> {
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(input()).toBeVisible();
}

test.beforeAll(async () => {
  root = createProject({ 'src/app.ts': 'export const version = 1;\n' });
  const userDataDir = createUserDataDir();
  configureMockAgent(userDataDir, { reviewChanges: true });
  app = await launchApp(userDataDir);
  page = await app.firstWindow();
  await stubOpenDialog(app, root);
  await stubMessageBox(app, 1);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await page.getByRole('tree', { name: 'Files' }).waitFor();
});

test.afterAll(async () => {
  await app.close();
});

test('runs two agents side by side with separate transcripts', async () => {
  await startInActiveTab();
  await send('hello');
  await expect(conversation()).toContainText('Hello from the mock agent.');
  await turnDone();

  await page.getByRole('button', { name: 'New agent tab' }).click();
  await expect(tabs()).toHaveCount(2);
  await expect(tabs().nth(1)).toHaveAttribute('aria-selected', 'true');
  await startInActiveTab();
  // The new tab has its own, empty conversation.
  await expect(conversation()).not.toContainText('Hello from the mock agent.');
  await send('peek src/app.ts');
  await expect(conversation()).toContainText('Content of src/app.ts');
  await turnDone();
  await expect(statusBar()).toContainText('2 agents running');

  await tabs().nth(0).click();
  await expect(conversation()).toContainText('Hello from the mock agent.');
  await expect(conversation()).not.toContainText('Content of src/app.ts');
});

test("an agent cannot overwrite another agent's held change", async () => {
  await tabs().nth(0).click();
  await send('edit src/app.ts export const version = 2;');
  await expect(changes()).toContainText('1 change to review');
  await turnDone();

  await tabs().nth(1).click();
  await send('edit src/app.ts export const version = 3;');
  await expect(conversation()).toContainText('I was not allowed to change src/app.ts.');
  await turnDone();
  expect(read('src/app.ts')).toBe('export const version = 1;\n');
  // Still the first agent's change, named in the list.
  await expect(changes()).toContainText('Mock agent');
  await changes().getByRole('button', { name: 'Accept change to “src/app.ts”' }).click();
  await expect(changes()).toHaveCount(0);
  expect(read('src/app.ts')).toBe('export const version = 2;\n');
});

test("each tab shows only its own agent's questions", async () => {
  await tabs().nth(0).click();
  await send('run npm test');
  const card = page.getByRole('article', { name: /Mock agent wants to run a command/ });
  await expect(card).toBeVisible();
  await expect(statusBar()).toContainText('1 question for you');

  // The other tab does not show the question; the first tab says it waits.
  await tabs().nth(1).click();
  await expect(card).toHaveCount(0);
  await expect(tabs().nth(0)).toContainText('waiting for you');

  await tabs().nth(0).click();
  await card.getByRole('button', { name: 'Deny' }).click();
  await expect(conversation()).toContainText('Command rejected.');
  await turnDone();
  await expect(statusBar()).not.toContainText('question for you');
});

test('closing a tab ends its agent and keeps the other one', async () => {
  await page.getByRole('button', { name: 'Close “Mock agent”' }).nth(1).click();
  await expect(tabs()).toHaveCount(1);
  await expect(statusBar()).toContainText('Mock agent · ready');
  await send('hello');
  await expect(conversation()).toContainText('Hello from the mock agent.');
  await turnDone();
});
