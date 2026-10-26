import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { bundleMockAgent, configureMockAgent, stubMessageBox } from './agent-helpers';
import { startTestSite } from './browser-helpers';
import { createUserDataDir, launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

const input = (page: Page) => page.getByRole('textbox', { name: 'Message to the agent' });
const conversation = (page: Page) => page.getByRole('log', { name: 'Conversation with the agent' });

async function send(page: Page, text: string): Promise<void> {
  await input(page).fill(text);
  await input(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
}

test.describe('without Docker', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    const userDataDir = createUserDataDir();
    configureMockAgent(userDataDir);
    // A socket that does not exist: Docker counts as "not running".
    app = await launchApp(userDataDir, { DOCKER_HOST: 'unix:///nonexistent/docker.sock' });
    page = await app.firstWindow();
    await stubOpenDialog(app, createProject({ 'a.txt': '' }));
    await stubMessageBox(app, 1);
    await page.getByRole('button', { name: 'Open folder …' }).first().click();
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('shows that a direct agent runs on the system', async () => {
    await expect(page.getByTestId('sandbox-badge')).toHaveText('Directly on the system');
  });

  test('explains how to get Docker running', async () => {
    await page.getByRole('button', { name: 'Manage agents' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Manage agents' });
    const toggle = dialog.getByLabel('Run in the Docker sandbox (recommended)');
    await expect(toggle).not.toBeChecked();
    await expect(dialog.getByText(/Docker is not (running|installed)\./)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Check again' })).toBeVisible();
    await toggle.check();
    await expect(dialog.getByLabel('Memory (GB)')).toHaveValue('1');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sandbox-badge')).toHaveText('Sandbox');
  });

  test('does not fall back to the system when the sandbox is missing', async () => {
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(
      page.getByText('Mock agent could not be started in the sandbox. Is Docker running?'),
    ).toBeVisible();
    await expect(input(page)).toHaveCount(0);
  });
});

/**
 * Needs a running Docker daemon: KESTREL_E2E_DOCKER=1. Optional:
 * KESTREL_E2E_SANDBOX_BASE_IMAGE (e.g. a mirror) and KESTREL_SANDBOX_PACKAGES
 * ("" where apt cannot reach Debian).
 */
test.describe('in a Docker container', () => {
  test.skip(process.env['KESTREL_E2E_DOCKER'] !== '1', 'needs Docker (KESTREL_E2E_DOCKER=1)');
  test.describe.configure({ timeout: 300_000 });

  let app: ElectronApplication;
  let page: Page;
  let root: string;

  test.beforeAll(async () => {
    root = realpathSync(
      createProject({
        'src/app.ts': 'export const version = 1;\n',
        '.env': 'SECRET=do-not-leak\n',
      }),
    );
    const script = await bundleMockAgent(join(root, '.agent'));
    const instanceDir = createUserDataDir();
    configureMockAgent(instanceDir, { sandbox: { script } });
    const baseImage = process.env['KESTREL_E2E_SANDBOX_BASE_IMAGE'];
    if (baseImage) {
      writeFileSync(
        join(instanceDir, 'settings.json'),
        JSON.stringify({ sandboxBaseImage: baseImage }),
      );
    }
    app = await launchApp(instanceDir);
    page = await app.firstWindow();
    await stubOpenDialog(app, root);
    await stubMessageBox(app, 1);
    await page.getByRole('button', { name: 'Open folder …' }).first().click();
    await page.getByRole('tree', { name: 'Files' }).waitFor();
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('builds the image and starts the agent in the sandbox', async () => {
    await expect(page.getByTestId('sandbox-badge')).toHaveText('Sandbox');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(input(page)).toBeVisible({ timeout: 240_000 });
    await expect(
      page.getByRole('contentinfo', { name: 'Status bar' }).getByTestId('sandbox-badge'),
    ).toHaveText('Sandbox');
    await send(page, 'whoami');
    await expect(conversation(page)).toContainText('HOME=/home/kestrel SANDBOX=1');
  });

  test('sees the project, but secret files are empty', async () => {
    await send(page, 'peek src/app.ts');
    await expect(conversation(page)).toContainText(
      'Content of src/app.ts: [export const version = 1;]',
    );
    await send(page, 'peek .env');
    await expect(conversation(page)).toContainText('Content of .env: []');
    expect(readFileSync(join(root, '.env'), 'utf8')).toBe('SECRET=do-not-leak\n');
  });

  test('writes files as the host user', async () => {
    await send(page, 'direct out.txt from the container');
    await expect(conversation(page)).toContainText('Changed out.txt.');
    expect(readFileSync(join(root, 'out.txt'), 'utf8')).toBe('from the container\n');
    expect(statSync(join(root, 'out.txt')).uid).toBe(process.getuid?.());
  });

  test('shows the build output in the logs', async () => {
    await page.getByRole('tab', { name: 'Logs' }).click();
    await page.getByRole('radio', { name: 'Docker' }).click();
    await expect(page.getByLabel('Docker output', { exact: true })).toContainText(
      'covering 1 secret file(s) or folder(s).',
    );
  });

  test('opens a login terminal in the sandbox', async () => {
    await page.getByRole('button', { name: 'Manage agents' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Manage agents' });
    await dialog.getByRole('button', { name: 'Log in in the sandbox terminal' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tab', { name: /Mock agent login/ })).toBeVisible();
    const rows = page.locator('[data-terminal]:not([hidden]) .xterm-rows');
    await page.locator('[data-terminal]:not([hidden]) .xterm-screen').click();
    await page.keyboard.type('echo "home is $HOME"');
    await page.keyboard.press('Enter');
    await expect(rows).toContainText('home is /home/kestrel');
  });

  test("reaches Kestrel's browser tools from the container", async () => {
    const site = await startTestSite();
    try {
      await page.keyboard.press('Control+Shift+O');
      const address = page.getByRole('textbox', { name: 'Address' });
      await address.fill(site.url);
      await address.press('Enter');
      await expect(page.getByRole('tab', { name: 'Test home' })).toBeVisible();
      await send(page, 'mcp browser_list_tabs');
      await expect(conversation(page)).toContainText(`Tool result:`);
      await expect(conversation(page)).toContainText(`${site.url}/`);
    } finally {
      await site.close();
    }
  });

  test('removes its containers when the app quits', async () => {
    await app.close();
    const leftovers = () =>
      execFileSync('docker', ['ps', '-aq', '--filter', 'label=dev.kestrel.sandbox.agent=mock'])
        .toString()
        .trim();
    // AutoRemove takes a moment after the containers stopped.
    await expect.poll(leftovers, { timeout: 15_000 }).toBe('');
    // afterAll closes the app again.
    app = await launchApp(createUserDataDir());
  });
});
