import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await launchApp();
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
});

test('shows the workbench with welcome screen and agent panel', async () => {
  await expect(page).toHaveTitle('Kestrel');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Kestrel' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Agent' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('renderer has no access to Node.js', async () => {
  const exposed = await page.evaluate(() => {
    const scope = globalThis as Record<string, unknown>;
    return {
      require: typeof scope['require'],
      process: typeof scope['process'],
      kestrelKeys: Object.keys(scope['kestrel'] as object).sort(),
    };
  });
  expect(exposed).toEqual({
    require: 'undefined',
    process: 'undefined',
    kestrelKeys: ['invoke', 'on'],
  });
});

test('rejects unknown IPC channels', async () => {
  const result = await page.evaluate(() => {
    const api = (globalThis as unknown as { kestrel: { invoke: (c: string) => Promise<unknown> } })
      .kestrel;
    return api.invoke('shell:exec');
  });
  expect(result).toMatchObject({ ok: false, error: { code: 'unknown_channel' } });
});

test('cycles the color theme', async () => {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: /^Color theme: Dark/ }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: /^Color theme: Light/ }).click();
  await page.getByRole('button', { name: /^Color theme: System/ }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('switches bottom panel tabs with the keyboard', async () => {
  await page.getByRole('tab', { name: 'Terminal' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('No entries yet')).toBeVisible();
});
