import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp } from './launch';

let app: ElectronApplication;
let page: Page;
const consoleErrors: string[] = [];

test.beforeAll(async () => {
  app = await launchApp();
  page = await app.firstWindow();
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleErrors.push(message.text());
    }
  });
  await page.getByRole('heading', { level: 1 }).waitFor();
});

test.afterAll(async () => {
  await app.close();
});

test('opens the palette with Ctrl+K and runs a command with the keyboard', async () => {
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.type('toggle agent panel');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Toggle agent panel' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('shows recently used commands first', async () => {
  await page.keyboard.press('Control+K');
  const firstOption = page.getByRole('dialog').getByRole('option').first();
  await expect(firstOption).toContainText('Toggle agent panel');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('runs commands through their shortcuts', async () => {
  const sidebarToggle = page.getByRole('button', { name: 'Toggle sidebar' });
  await expect(sidebarToggle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+B');
  await expect(sidebarToggle).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+Shift+F');
  await expect(sidebarToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
});

test('opens the palette from the title bar', async () => {
  await page.getByRole('button', { name: 'Search commands' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('switches the language from the palette', async () => {
  await page.keyboard.press('Control+K');
  await page.keyboard.type('Deutsch');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Willkommen bei Hoverwing' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');

  await page.keyboard.press('Control+K');
  await page.keyboard.type('English');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Hoverwing' })).toBeVisible();
});

test('logs no errors or warnings', () => {
  expect(consoleErrors).toEqual([]);
});
