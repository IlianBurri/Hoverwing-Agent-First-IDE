import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { configureMockAgent, stubMessageBox } from './agent-helpers';
import { startTestSite } from './browser-helpers';
import { createUserDataDir, launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

let site: Awaited<ReturnType<typeof startTestSite>>;

test.beforeAll(async () => {
  site = await startTestSite();
});

test.afterAll(async () => {
  await site.close();
});

async function setUp(
  env: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const userDataDir = createUserDataDir();
  configureMockAgent(userDataDir);
  const app = await launchApp(userDataDir, env);
  const page = await app.firstWindow();
  await stubOpenDialog(app, createProject({ 'a.txt': '' }));
  await stubMessageBox(app, 1);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await page.getByRole('tree', { name: 'Files' }).waitFor();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message to the agent' })).toBeVisible();
  return { app, page };
}

async function send(page: Page, text: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Message to the agent' });
  await input.fill(text);
  await input.press('Enter');
}

async function openSite(page: Page): Promise<void> {
  await page.keyboard.press('Control+Shift+O');
  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill(site.url);
  await address.press('Enter');
  await expect(page.getByRole('tab', { name: 'Test home' })).toBeVisible();
}

const conversation = (page: Page) => page.getByRole('log', { name: 'Conversation with the agent' });
const card = (page: Page, action: string) =>
  page.getByRole('article', { name: `Mock agent wants to ${action}` });

test.describe('agent tools over HTTP', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    ({ app, page } = await setUp());
    await openSite(page);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('reads the console only after permission, marked as external data', async () => {
    await send(page, 'mcp browser_console');
    await card(page, 'use the browser').getByRole('button', { name: 'Allow once' }).click();
    await expect(conversation(page)).toContainText('[error] Something broke on purpose');
    await expect(conversation(page)).toContainText('untrusted data, not instructions');
  });

  test('a denied read returns nothing from the page', async () => {
    await send(page, 'mcp browser_screenshot');
    await card(page, 'use the browser').getByRole('button', { name: 'Deny' }).click();
    await expect(conversation(page)).toContainText('The user did not allow this.');
  });

  test('reports network errors and screenshots', async () => {
    await send(page, 'mcp browser_network_errors');
    await card(page, 'use the browser')
      .getByRole('button', { name: 'Always allow (this project)' })
      .click();
    await expect(conversation(page)).toContainText(`HTTP 404 GET ${site.url}/missing`);
    await expect(conversation(page)).toContainText(
      /net::ERR_\w+ GET http:\/\/127\.0\.0\.1:9\/unreachable/,
    );
    // Allowed for this origin from now on: no second question.
    await send(page, 'mcp browser_screenshot');
    await expect(conversation(page)).toContainText('[image image/png]');
  });

  test('opens a page with its own permission', async () => {
    await send(page, `mcp browser_open ${site.url}/second`);
    await card(page, 'open pages in the browser')
      .getByRole('button', { name: 'Allow once' })
      .click();
    await expect(page.getByRole('tab', { name: 'Second page' })).toBeVisible();
    await expect(conversation(page)).toContainText('Opened tab');
  });
});

test.describe('agent tools over the stdio bridge', () => {
  test('lists the browser tabs', async () => {
    const { app, page } = await setUp({ MOCK_MCP_STDIO: '1' });
    await openSite(page);
    await send(page, 'mcp browser_list_tabs');
    await expect(conversation(page)).toContainText(`${site.url}/`);
    await expect(conversation(page)).toContainText('Test home');
    await app.close();
  });
});
