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

const conversation = () => page.getByRole('log', { name: 'Conversation with the agent' });
const input = () => page.getByRole('textbox', { name: 'Message to the agent' });

async function send(text: string): Promise<void> {
  await input().fill(text);
  await input().press('Enter');
}

/** Waits until the agent finished its turn (input is usable again). */
async function turnDone(): Promise<void> {
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
}

test.beforeAll(async () => {
  root = createProject({
    'src/app.ts': 'export const version = 1;\n',
    '.env': 'SECRET=do-not-leak\n',
  });
  const userDataDir = createUserDataDir();
  configureMockAgent(userDataDir);
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

test('starts the agent after confirming the command', async () => {
  await expect(page.getByRole('combobox', { name: 'Choose agent' })).toHaveValue('mock');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(input()).toBeVisible();
  await expect(page.getByRole('contentinfo', { name: 'Status bar' })).toContainText(
    'Mock agent · ready',
  );
});

test('streams answers and shows the plan', async () => {
  await send('hello');
  await expect(conversation()).toContainText('Hello from the mock agent.');
  await expect(conversation().locator('strong')).toHaveText('mock agent');
  await expect(page.getByRole('region', { name: 'Plan' })).toContainText('Answer politely');
  await turnDone();
});

test('a denied change leaves the file untouched', async () => {
  await send('edit src/app.ts export const version = 2;');
  const card = page.getByRole('article', { name: 'Mock agent wants to change a file' });
  await expect(card).toBeVisible();
  await expect(card.getByLabel('Proposed change')).toContainText('+export const version = 2;');
  await card.getByRole('button', { name: 'Deny' }).click();
  await expect(conversation()).toContainText('I was not allowed to change src/app.ts.');
  await turnDone();
  expect(readFileSync(join(root, 'src', 'app.ts'), 'utf8')).toBe('export const version = 1;\n');
});

test('an allowed change is written, and the checkpoint brings the old state back', async () => {
  await send('edit src/app.ts export const version = 3;');
  await page
    .getByRole('article', { name: 'Mock agent wants to change a file' })
    .getByRole('button', { name: 'Allow once' })
    .click();
  await expect(conversation()).toContainText('Changed src/app.ts.');
  await turnDone();
  expect(readFileSync(join(root, 'src', 'app.ts'), 'utf8')).toBe('export const version = 3;\n');

  // A checkpoint was created before the turn, labelled with the prompt.
  const timeline = page.getByRole('region', { name: 'Checkpoints' });
  await timeline
    .getByRole('button', { name: /edit src\/app\.ts export const version = 3;/ })
    .click();
  const modal = page.getByRole('dialog', { name: /^Since/ });
  await modal.getByRole('button', { name: 'Restore everything to this state' }).click();
  await page
    .getByRole('dialog', { name: 'Restore the project to this checkpoint?' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await expect(page.getByText('Restored 1 file.')).toBeVisible();
  expect(readFileSync(join(root, 'src', 'app.ts'), 'utf8')).toBe('export const version = 1;\n');
});

test('secret files are blocked without asking', async () => {
  await send('secret');
  await expect(conversation()).toContainText('Reading .env was blocked.');
  await turnDone();
  await page.getByRole('tab', { name: 'Logs' }).click();
  await expect(page.getByRole('table', { name: 'Permission log' })).toContainText('secret guard');
});

test('"always allow" is remembered for the project', async () => {
  await send('run npm test');
  await page
    .getByRole('article', { name: 'Mock agent wants to run a command' })
    .getByRole('button', { name: 'Always allow (this project)' })
    .click();
  await expect(conversation()).toContainText('Command allowed.');
  await turnDone();

  await send('run npm test');
  await turnDone();
  await expect(conversation().getByText('Command allowed.')).toHaveCount(2);
  await expect(page.getByRole('article', { name: /wants to run a command/ })).toHaveCount(0);
});

test('stops a running turn', async () => {
  await send('slow');
  await expect(conversation()).toContainText('Working on it…');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(conversation()).toContainText('Stopped.');
  await turnDone();
});

test('resumes an earlier session', async () => {
  await page.getByRole('button', { name: 'Earlier sessions' }).click();
  await page.getByRole('menuitem', { name: 'hello' }).click();
  await expect(conversation()).toContainText('Restored answer from the earlier session.');
});
