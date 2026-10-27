import { realpathSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { createUserDataDir, launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

let app: ElectronApplication;
let page: Page;
let userData: string;

const dialog = () => page.getByRole('dialog', { name: 'Customize layout' });
const statusBar = () => page.getByRole('contentinfo', { name: 'Status bar' });
const x = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())?.x ?? -1;
const terminalText = () =>
  page
    .locator('[data-terminal]:not([hidden]) .xterm-rows')
    .evaluate((node) => (node as unknown as { innerText: string }).innerText);

async function openDialog(): Promise<void> {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Customize layout');
  await page.keyboard.press('Enter');
  await expect(dialog()).toBeVisible();
}

async function closeDialog(): Promise<void> {
  await dialog().getByRole('button', { name: 'Close', exact: true }).click();
}

test.beforeAll(async () => {
  const root = realpathSync(createProject({ 'a.txt': 'a\n' }));
  userData = createUserDataDir();
  app = await launchApp(userData);
  page = await app.firstWindow();
  await stubOpenDialog(app, root);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
});

test.afterAll(async () => {
  await app.close();
});

test('moves sidebar and agent panel to the other side without losing a terminal', async () => {
  await page.keyboard.press('Control+Backquote');
  await page.keyboard.type('echo kestrel-$((40+2))');
  await page.keyboard.press('Enter');
  await expect.poll(terminalText).toContain('kestrel-42');

  const tree = page.getByRole('tree', { name: 'Files' });
  const agent = page.getByRole('heading', { name: 'Agent' });
  expect(await x(tree)).toBeLessThan(await x(agent));

  await openDialog();
  await dialog()
    .getByRole('radiogroup', { name: 'Sidebar' })
    .getByRole('radio', { name: 'Right' })
    .click();
  await dialog()
    .getByRole('radiogroup', { name: 'Agent panel' })
    .getByRole('radio', { name: 'Left' })
    .click();
  await closeDialog();

  await expect.poll(async () => (await x(tree)) > (await x(agent))).toBe(true);
  // The activity bar moved along with the sidebar.
  const activity = page.getByRole('navigation', { name: 'Activities' });
  await expect.poll(async () => (await x(activity)) > (await x(tree))).toBe(true);
  // Same terminal, same output: the panels were moved, not rebuilt.
  await expect(page.locator('[data-terminal]')).toHaveCount(1);
  await expect.poll(terminalText).toContain('kestrel-42');
});

test('hides status bar entries and bottom tabs', async () => {
  await openDialog();
  await dialog().getByRole('checkbox', { name: 'Project name' }).uncheck();
  await dialog().getByRole('checkbox', { name: 'Logs', exact: true }).uncheck();
  await closeDialog();
  await expect(statusBar().getByText('kestrel-project-')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Logs', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Terminal', exact: true })).toBeVisible();
});

test('applies the Focus layout and saves an own layout', async () => {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Layout: Focus');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tree', { name: 'Files' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Agent' })).toBeHidden();

  await openDialog();
  await dialog().getByRole('button', { name: 'Save current layout …' }).click();
  await page.getByRole('textbox', { name: 'Name of the layout' }).fill('Writing');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog().getByText('Writing', { exact: true })).toBeVisible();

  await dialog().getByRole('button', { name: 'Reset layout' }).click();
  await closeDialog();
  await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Logs', exact: true })).toBeVisible();
});

test('restores the saved layout after a restart', async () => {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Layout: Writing');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tree', { name: 'Files' })).toBeHidden();
  // Saves are debounced.
  await page.waitForTimeout(800);
  await app.close();

  app = await launchApp(userData);
  page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Agent' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Toggle sidebar' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
