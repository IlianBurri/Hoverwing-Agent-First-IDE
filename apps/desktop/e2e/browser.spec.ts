import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { startTestSite } from './browser-helpers';
import { launchApp } from './launch';

let app: ElectronApplication;
let page: Page;
let site: Awaited<ReturnType<typeof startTestSite>>;

const address = () => page.getByRole('textbox', { name: 'Address' });
const tabs = () => page.getByRole('tablist', { name: 'Open files' });

/** Visibility of the native page views, as main sees them. */
function pageViewsVisible(): Promise<boolean[]> {
  return app.evaluate(({ BrowserWindow }) =>
    (BrowserWindow.getAllWindows()[0]?.contentView.children ?? []).map((view) => view.getVisible()),
  );
}

async function openBrowser(): Promise<void> {
  await page.keyboard.press('Control+Shift+O');
  await expect(address()).toBeFocused();
}

test.beforeAll(async () => {
  site = await startTestSite();
  app = await launchApp();
  page = await app.firstWindow();
  await page.getByRole('heading', { name: 'Welcome to Kestrel' }).waitFor();
});

test.afterAll(async () => {
  await app.close();
  await site.close();
});

test('opens a page typed into the address bar', async () => {
  await openBrowser();
  await expect(page.getByText('Enter an address above.')).toBeVisible();
  await address().fill(site.url.replace('http://', ''));
  await address().press('Enter');
  await expect(tabs().getByRole('tab', { name: 'Test home' })).toBeVisible();
  await expect(address()).toHaveValue(`${site.url}/`);
  await expect.poll(pageViewsVisible).toEqual([true]);
});

test('goes back and forward', async () => {
  await address().fill(`${site.url}/second`);
  await address().press('Enter');
  await expect(tabs().getByRole('tab', { name: 'Second page' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(tabs().getByRole('tab', { name: 'Test home' })).toBeVisible();
  await page.getByRole('button', { name: 'Forward' }).click();
  await expect(tabs().getByRole('tab', { name: 'Second page' })).toBeVisible();
});

test('refuses addresses that are not web pages', async () => {
  await address().fill('file:///etc/passwd');
  await address().press('Enter');
  await expect(page.getByText(/Only web addresses \(http or https\) can be opened/)).toBeVisible();
  await expect(tabs().getByRole('tab', { name: 'Second page' })).toBeVisible();
});

test('hides the page while the command palette is open', async () => {
  await page.keyboard.press('Control+Shift+P');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await expect.poll(pageViewsVisible).toEqual([false]);
  await page.keyboard.press('Escape');
  await expect.poll(pageViewsVisible).toEqual([true]);
});

test('opens popups as a new tab', async () => {
  await address().fill(`${site.url}/?popup=1`);
  await address().press('Enter');
  await expect(tabs().getByRole('tab')).toHaveCount(2);
  await expect(tabs().getByRole('tab', { name: 'Second page' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('closing a tab closes its page', async () => {
  await page.getByRole('button', { name: 'Close “Second page”' }).click();
  await expect(tabs().getByRole('tab')).toHaveCount(1);
  await expect.poll(async () => (await pageViewsVisible()).length).toBe(1);
});
