import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { launchApp } from './launch';

let app: ElectronApplication;

test.afterAll(async () => {
  await app.close();
});

// Runs in its own app instance: a blocked navigation leaves the page in a
// state where Playwright keeps waiting for it to finish.
test('blocks new windows and external navigation', async () => {
  app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('heading', { level: 1 }).waitFor();

  void page.evaluate(() => {
    const win = globalThis as unknown as {
      open: (url: string) => unknown;
      location: { href: string };
    };
    win.open('https://example.com');
    win.location.href = 'https://example.com';
  });

  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
    .toBe(1);
  const url = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.getURL(),
  );
  expect(url).toMatch(/^file:.*index\.html$/);
});
