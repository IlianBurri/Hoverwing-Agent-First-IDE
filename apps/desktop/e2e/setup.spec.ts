import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { startFakeOllama } from './fake-ollama';
import { createUserDataDir, launchApp } from './launch';

test('skipping the assistant on first start keeps it closed', async () => {
  const userDataDir = createUserDataDir({ firstStart: true });
  const app = await launchApp(userDataDir);
  const page = await app.firstWindow();
  const wizard = page.getByRole('dialog', { name: 'Set up local models' });
  await expect(wizard).toBeVisible();
  await wizard.getByRole('button', { name: 'Skip assistant' }).click();
  await expect(wizard).toHaveCount(0);
  await expect
    .poll(() => readFileSync(join(userDataDir, 'settings.json'), 'utf8'))
    .toContain('"setupDone": true');
  await app.close();
});

test('detects hardware, downloads a model, measures it and uses it', async () => {
  test.setTimeout(90_000);
  const ollama = await startFakeOllama();
  const app = await launchApp(createUserDataDir({ firstStart: true }), {
    KESTREL_OLLAMA_URL: ollama.url,
  });
  const page = await app.firstWindow();
  const wizard = page.getByRole('dialog', { name: 'Set up local models' });
  await wizard.getByRole('button', { name: 'Start' }).click();

  // Real hardware detection (takes a few seconds).
  const facts = wizard.getByRole('definition');
  await expect(wizard.getByText('Memory', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(facts.first()).not.toBeEmpty();
  await expect(wizard.getByText('Recommendation', { exact: true })).toBeVisible();

  await wizard.getByRole('button', { name: 'Next' }).click();
  await expect(wizard.getByText('Ollama 9.9.9 is running.')).toBeVisible();

  await wizard.getByRole('button', { name: 'Next' }).click();
  await wizard.getByLabel('Autocompletion').selectOption('qwen2.5-coder:1.5b');
  await wizard.getByLabel('Chat').selectOption('');
  await wizard.getByRole('button', { name: 'Download qwen2.5-coder:1.5b' }).click();
  await expect(wizard.getByText('downloaded', { exact: true })).toBeVisible();

  await wizard.getByRole('button', { name: 'Next' }).click();
  await wizard.getByRole('button', { name: 'Run speed test' }).click();
  await expect(wizard.getByText('50.0 tokens/s – fluid')).toBeVisible();

  await wizard.getByRole('button', { name: 'Next' }).click();
  await expect(wizard).toContainText('qwen2.5-coder:1.5b');
  await wizard.getByRole('button', { name: 'Finish' }).click();
  await expect(wizard).toHaveCount(0);
  await expect(page.getByText('Local models are set up.')).toBeVisible();

  // The local provider is there and autocompletion uses it.
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await expect(page.getByRole('listitem', { name: 'Ollama' })).toContainText('qwen2.5-coder:1.5b');
  await expect(page.getByRole('contentinfo', { name: 'Status bar' })).toContainText(
    'Autocompletion',
  );
  await app.close();
  await ollama.close();
});
