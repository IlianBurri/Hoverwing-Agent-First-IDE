import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

test('creates a checkpoint and restores the project to it', async () => {
  const root = createProject({
    'src/app.ts': 'export const version = 1;\n',
    'README.md': '# Demo\n',
  });
  const app = await launchApp();
  const page = await app.firstWindow();
  await stubOpenDialog(app, root);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await page.getByRole('tree', { name: 'Files' }).waitFor();

  const timeline = page.getByRole('region', { name: 'Checkpoints' });
  await expect(timeline).toContainText('No checkpoints yet');

  await page.keyboard.press('Control+K');
  await page.keyboard.type('Create checkpoint');
  await page.keyboard.press('Enter');
  await expect(timeline.getByRole('button', { name: /Manual checkpoint/ })).toBeVisible();

  // Something (e.g. an agent) changes the project.
  writeFileSync(join(root, 'src', 'app.ts'), 'export const version = 2; // broken\n');
  writeFileSync(join(root, 'src', 'extra.ts'), 'new file\n');

  await timeline.getByRole('button', { name: /Manual checkpoint/ }).click();
  const modal = page.getByRole('dialog', { name: /Since “Manual checkpoint”/ });
  const files = modal.getByRole('list', { name: 'Changed files' });
  await expect(files.getByRole('listitem')).toHaveCount(2);
  await expect(files).toContainText('src/app.ts');
  await expect(files).toContainText('src/extra.ts');

  await modal.getByRole('button', { name: 'Restore everything to this state' }).click();
  const confirmDialog = page.getByRole('dialog', {
    name: 'Restore the project to this checkpoint?',
  });
  await confirmDialog.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Restored 2 files.')).toBeVisible();

  expect(readFileSync(join(root, 'src', 'app.ts'), 'utf8')).toBe('export const version = 1;\n');
  expect(existsSync(join(root, 'src', 'extra.ts'))).toBe(false);
  // The state before restoring was saved too, so the restore can be undone.
  await expect(timeline.getByRole('button', { name: /Before restore/ })).toBeVisible();
  await app.close();
});
