import { expect, test } from '@playwright/test';
import { configureMockAgent, stubMessageBox } from './agent-helpers';
import { createUserDataDir, launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

test('does not start an agent the user did not confirm', async () => {
  const userDataDir = createUserDataDir();
  configureMockAgent(userDataDir);
  const app = await launchApp(userDataDir);
  const page = await app.firstWindow();
  await stubOpenDialog(app, createProject({ 'a.txt': '' }));
  await stubMessageBox(app, 0); // "Cancel"
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message to the agent' })).toHaveCount(0);
  await expect(page.getByRole('contentinfo', { name: 'Status bar' })).toContainText('No agent');
  await app.close();
});

test('explains when the agent cannot be started', async () => {
  const userDataDir = createUserDataDir();
  configureMockAgent(userDataDir);
  const app = await launchApp(userDataDir);
  const page = await app.firstWindow();
  await stubOpenDialog(app, createProject({ 'a.txt': '' }));
  await stubMessageBox(app, 1);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await page.getByRole('button', { name: 'Manage agents' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Manage agents' });
  await dialog.getByLabel('Command').fill('/does/not/exist/agent');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(
    page.getByText('Mock agent could not be started. Is the program installed?'),
  ).toBeVisible();
  await app.close();
});
