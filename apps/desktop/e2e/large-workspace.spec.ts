import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

/** Acceptance criterion 6.1: 10,000 files open without freezing the UI. */
test('opens a project with 10,000 files without freezing', async () => {
  const root = createProject({ 'README.md': '' });
  for (let folder = 0; folder < 10; folder++) {
    const dir = join(root, `pkg${String(folder)}`);
    mkdirSync(dir);
    for (let file = 0; file < 1000; file++) writeFileSync(join(dir, `f${String(file)}.ts`), '');
  }

  const app = await launchApp();
  const page = await app.firstWindow();
  await stubOpenDialog(app, root);
  await page.getByRole('heading', { level: 1 }).waitFor();

  // Record every main-thread task longer than 50 ms from now on.
  await page.evaluate(() => {
    const scope = globalThis as unknown as { longTasks: number[] };
    scope.longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) scope.longTasks.push(entry.duration);
      // 'longtask' is supported by Chromium but missing from the DOM typings.
    }).observe({ type: 'longtask' as 'mark' });
  });

  const started = Date.now();
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  const tree = page.getByRole('tree', { name: 'Files' });
  await expect(tree.getByRole('treeitem', { name: 'pkg0', exact: true })).toBeVisible();

  // Expand all ten folders: 10,000 rows in the (virtualized) tree. Bottom-up,
  // so the next folder is still on screen (off-screen rows are not rendered).
  for (let folder = 9; folder >= 0; folder--) {
    const row = tree.getByRole('treeitem', { name: `pkg${String(folder)}`, exact: true });
    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(tree.getByRole('treeitem', { name: 'f0.ts', exact: true })).toBeVisible();
  await tree.focus();
  await page.keyboard.press('End');
  await expect(tree.getByRole('treeitem', { name: 'README.md', exact: true })).toBeVisible();
  const elapsed = Date.now() - started;

  const longTasks = await page.evaluate(
    () => (globalThis as unknown as { longTasks: number[] }).longTasks,
  );
  const rendered = await tree.getByRole('treeitem').count();
  await app.close();

  test.info().annotations.push({
    type: 'measurements',
    description: `open+expand: ${String(elapsed)} ms, longest task: ${String(Math.max(0, ...longTasks))} ms, rendered rows: ${String(rendered)}`,
  });
  console.log(test.info().annotations.at(-1)?.description);
  expect(rendered).toBeLessThan(200); // virtualization: only visible rows exist
  expect(Math.max(0, ...longTasks)).toBeLessThan(200);
  expect(elapsed).toBeLessThan(5000);
});
