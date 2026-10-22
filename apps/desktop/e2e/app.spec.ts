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

test('shows the main window with app info from IPC', async () => {
  await expect(page).toHaveTitle('Kestrel');
  await expect(page.getByRole('heading', { level: 1, name: 'Kestrel' })).toBeVisible();
  await expect(page.getByTestId('app-info')).toContainText('Kestrel');
});

test('renderer has no access to Node.js', async () => {
  const exposed = await page.evaluate(() => {
    const scope = globalThis as Record<string, unknown>;
    return {
      require: typeof scope['require'],
      process: typeof scope['process'],
      kestrelKeys: Object.keys(scope['kestrel'] as object),
    };
  });
  expect(exposed).toEqual({ require: 'undefined', process: 'undefined', kestrelKeys: ['invoke'] });
});

test('rejects unknown IPC channels', async () => {
  const result = await page.evaluate(() => {
    const api = (globalThis as unknown as { kestrel: { invoke: (c: string) => Promise<unknown> } })
      .kestrel;
    return api.invoke('shell:exec');
  });
  expect(result).toMatchObject({ ok: false, error: { code: 'unknown_channel' } });
});

test('switches between dark and light theme', async () => {
  const html = page.locator('html');
  await page.getByRole('radio', { name: /^(Hell|Light)$/ }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: /^(Dunkel|Dark)$/ }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});
