import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

let app: ElectronApplication;
let page: Page;
let root: string;

/** Visible text of the active terminal (xterm's DOM renderer). */
function terminalText(): Promise<string> {
  return page
    .locator('[data-terminal]:not([hidden]) .xterm-rows')
    .evaluate((node) =>
      (node as unknown as { innerText: string }).innerText.replace(/\u00a0/g, ' '),
    );
}

async function run(command: string): Promise<void> {
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

test.beforeAll(async () => {
  root = realpathSync(
    createProject({
      'README.md': '# Demo\n',
      // No dependencies: npm install runs completely offline.
      'package.json': JSON.stringify({ name: 'demo', version: '1.0.0', private: true }),
    }),
  );
  execFileSync('git', ['init', '-q'], { cwd: root });
  app = await launchApp();
  page = await app.firstWindow();
  await stubOpenDialog(app, root);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await page.getByRole('tree', { name: 'Files' }).waitFor();
});

test.afterAll(async () => {
  await app.close();
});

test('opens a terminal in the project folder with Ctrl+`', async () => {
  await page.keyboard.press('Control+Backquote');
  await expect(page.locator('[data-terminal]')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Terminal input' })).toBeFocused();
  await run('pwd');
  await expect.poll(terminalText).toContain(root);
  await run('echo kestrel-$((1+2))');
  await expect.poll(terminalText).toContain('kestrel-3');
});

test('runs git status', async () => {
  await run('git status');
  await expect.poll(terminalText).toMatch(/No commits yet|On branch/);
});

test('runs npm install', async () => {
  await run('npm install --no-audit --no-fund');
  await expect.poll(terminalText, { timeout: 30_000 }).toMatch(/up to date|added 0 packages/);
});

test('runs full-screen programs (less)', async () => {
  await run('clear; seq 1 500 | less');
  // less switches to the alternate screen and shows the first page.
  await expect.poll(terminalText).toMatch(/^1\n2\n3/);
  await page.keyboard.press('G');
  await expect.poll(terminalText).toContain('500');
  await page.keyboard.press('q');
  await run('echo back-from-less');
  await expect.poll(terminalText).toContain('back-from-less');
});

test('supports interactive programs', async () => {
  await run('read -p "Name? " name; echo "Hello, $name!"');
  await expect.poll(terminalText).toContain('Name?');
  await run('Ada');
  await expect.poll(terminalText).toContain('Hello, Ada!');
});

test('sends Ctrl+C to the shell, not to the IDE', async () => {
  await run('sleep 30; echo not-interrupted');
  await page.keyboard.press('Control+C');
  await run('echo after-interrupt');
  await expect.poll(terminalText).toContain('after-interrupt');
  expect(await terminalText()).not.toContain('not-interrupted');
  // Ctrl+B is "back one character" in the shell; the sidebar stays open.
  await page.keyboard.press('Control+B');
  await expect(page.getByRole('button', { name: 'Toggle sidebar' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('keeps several terminals and ends them', async () => {
  await run('clear; echo first-terminal');
  await expect.poll(terminalText).toContain('first-terminal');
  await page.getByRole('button', { name: 'New terminal' }).click();
  const sessions = page.getByRole('tablist', { name: 'Terminals' }).getByRole('tab');
  await expect(sessions).toHaveCount(2);
  await run('echo second-terminal');
  await expect.poll(terminalText).toContain('second-terminal');

  // The first terminal kept its content while it was in the background.
  await sessions.first().click();
  await expect.poll(terminalText).toContain('first-terminal');

  await page.getByRole('button', { name: 'Kill terminal' }).click();
  await expect(sessions).toHaveCount(1);
});

test('shows that the shell ended after exit', async () => {
  await page.getByRole('tablist', { name: 'Terminals' }).getByRole('tab').first().click();
  await page.locator('[data-terminal]:not([hidden])').click();
  await run('exit 3');
  await expect.poll(terminalText).toContain('[Process exited with code 3]');
});
