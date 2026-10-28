import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { configureMockAgent, stubMessageBox } from './agent-helpers';
import { createUserDataDir, launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

let app: ElectronApplication;
let page: Page;

const conversation = () => page.getByRole('log', { name: 'Conversation with the agent' });
const input = () => page.getByRole('textbox', { name: 'Message to the agent' });
const settings = () => page.getByRole('group', { name: 'Session settings' });

test.beforeAll(async () => {
  const root = createProject({ 'README.md': '# demo\n' });
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

test('picks model, effort and mode the agent offers', async () => {
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(input()).toBeVisible();
  const model = settings().getByRole('combobox', { name: 'Model', exact: true });
  const mode = settings().getByRole('combobox', { name: 'Mode', exact: true });
  await expect(model).toHaveValue('mock-small');
  // Modes that skip the permission questions are never offered.
  await expect(mode.locator('option')).toHaveText(['Ask first', 'Plan']);

  await model.selectOption('mock-large');
  await settings().getByRole('combobox', { name: 'Effort' }).selectOption('high');
  await mode.selectOption('plan');
  await expect(model).toHaveValue('mock-large');

  await input().fill('settings');
  await input().press('Enter');
  await expect(conversation()).toContainText('model=mock-large effort=high mode=plan');
  await expect(settings()).toContainText('42k / 200k');
  await expect(settings().getByRole('meter', { name: 'Context used' })).toBeVisible();
});

test('applies the remembered choices on the next start', async () => {
  await page.getByRole('button', { name: 'End agent' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(input()).toBeVisible();
  await expect(settings().getByRole('combobox', { name: 'Model', exact: true })).toHaveValue(
    'mock-large',
  );
  await input().fill('settings');
  await input().press('Enter');
  await expect(conversation()).toContainText('model=mock-large effort=high mode=plan');
});
