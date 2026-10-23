import { expect, test } from '@playwright/test';
import { launchApp } from './launch';

test('manages permission rules from the command palette', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('heading', { level: 1 }).waitFor();

  await page.keyboard.press('Control+K');
  await page.keyboard.type('Manage permissions');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Manage permissions' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('No rules yet.', { exact: false })).toBeVisible();

  // Without an open project only global rules are possible.
  await dialog.getByLabel('Kind').selectOption('command.run');
  await dialog.getByLabel('Pattern').fill('npm test');
  await dialog.getByRole('button', { name: 'Add rule' }).click();
  const row = dialog.getByRole('row', { name: /npm test/ });
  await expect(row).toContainText('Run command');
  await expect(row).toContainText('All projects');

  await row.getByRole('button', { name: 'Delete rule “npm test”' }).click();
  await expect(dialog.getByRole('row', { name: /npm test/ })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await app.close();
});
