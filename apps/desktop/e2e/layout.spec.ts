import { expect, test } from '@playwright/test';
import { createUserDataDir, launchApp } from './launch';

test('panel visibility and sidebar view survive a restart', async () => {
  const userDataDir = createUserDataDir();

  let app = await launchApp(userDataDir);
  let page = await app.firstWindow();
  const agentToggle = page.getByRole('button', { name: 'Toggle agent panel' });
  await expect(agentToggle).toHaveAttribute('aria-pressed', 'true');

  await agentToggle.click();
  await expect(agentToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: 'Agent' })).toBeHidden();

  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();

  // Layout saves are debounced; wait until they reach the settings file.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const api = (
          globalThis as unknown as {
            kestrel: { invoke: (c: string) => Promise<{ ok: boolean; data: unknown }> };
          }
        ).kestrel;
        const result = await api.invoke('settings:get');
        const settings = result.data as {
          layout: { sidebarView: string; groups: Record<string, Record<string, number>> };
        };
        return [settings.layout.sidebarView, settings.layout.groups['main']?.['agent']];
      }),
    )
    .toEqual(['search', 0]);
  await app.close();

  app = await launchApp(userDataDir);
  page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Toggle agent panel' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await app.close();
});
