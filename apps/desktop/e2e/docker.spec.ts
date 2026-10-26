import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

test.describe('without Docker', () => {
  test('explains how to get Docker running', async () => {
    const app = await launchApp(undefined, { DOCKER_HOST: 'unix:///nonexistent/docker.sock' });
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Docker' }).click();
    await expect(page.getByText(/Docker is not (running|installed)\./)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
    await app.close();
  });
});

/** Needs Docker: KESTREL_E2E_DOCKER=1 (KESTREL_E2E_SANDBOX_BASE_IMAGE picks the image). */
test.describe('with Docker', () => {
  test.skip(process.env['KESTREL_E2E_DOCKER'] !== '1', 'needs Docker (KESTREL_E2E_DOCKER=1)');
  test.describe.configure({ timeout: 120_000 });

  const image = process.env['KESTREL_E2E_SANDBOX_BASE_IMAGE'] ?? 'node:22-bookworm-slim';
  const name = 'kestrel-e2e-web';
  let app: ElectronApplication;
  let page: Page;
  let root: string;
  let tag: string;

  const docker = (...args: string[]) => execFileSync('docker', args).toString().trim();
  const containers = () => page.getByRole('list', { name: 'Containers' });
  const row = () => containers().getByRole('listitem', { name });

  test.beforeAll(async () => {
    docker('rm', '-f', name);
    docker(
      'run',
      '-d',
      '--name',
      name,
      '--label',
      'dev.kestrel.test=1',
      '-p',
      '18080:8080',
      image,
      'node',
      '-e',
      "require('http').createServer((q, r) => r.end('hi')).listen(8080); setInterval(() => console.log('tick from web'), 300);",
    );
    root = realpathSync(
      createProject({
        Dockerfile: `FROM ${image}\nCOPY keep.txt /app/\nRUN echo building-in-kestrel\n`,
        'keep.txt': 'x',
      }),
    );
    tag = `${basename(root)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')}:latest`;
    app = await launchApp();
    page = await app.firstWindow();
    await stubOpenDialog(app, root);
    await page.getByRole('button', { name: 'Open folder …' }).first().click();
    await page.getByRole('tree', { name: 'Files' }).waitFor();
    await page.getByRole('button', { name: 'Docker', exact: true }).click();
  });

  test.afterAll(async () => {
    await app.close();
    execFileSync('docker', ['rm', '-f', name]);
    try {
      execFileSync('docker', ['rmi', '-f', tag]);
    } catch {
      // already removed by the test
    }
  });

  test('lists running containers with their ports', async () => {
    await expect(row()).toContainText('running');
    await expect(row()).toContainText(image);
    await expect(row().getByRole('button', { name: '18080 → 8080' })).toBeVisible();
    await expect(page.getByRole('contentinfo', { name: 'Status bar' })).toContainText(
      /container(s)? running/,
    );
  });

  test('opens a published port in the integrated browser', async () => {
    await row().getByRole('button', { name: '18080 → 8080' }).click();
    await expect(page.getByRole('textbox', { name: 'Address' })).toHaveValue(
      'http://localhost:18080/',
    );
  });

  test('follows the logs of a container', async () => {
    await row()
      .getByRole('button', { name: `Logs of ${name}` })
      .click();
    await expect(page.getByRole('tab', { name: new RegExp(name) })).toBeVisible();
    await expect(page.locator('[data-docker-output] .xterm-rows')).toContainText('tick from web');
  });

  test('stops and starts a container', async () => {
    await row()
      .getByRole('button', { name: `Stop ${name}`, exact: true })
      .click();
    await expect(row()).toContainText('stopped', { timeout: 20_000 });
    await row()
      .getByRole('button', { name: `Start ${name}`, exact: true })
      .click();
    await expect(row()).toContainText('running');
  });

  test('builds an image from a project Dockerfile', async () => {
    const files = page.getByRole('list', { name: 'Dockerfiles in the project' });
    await files.getByRole('button', { name: 'Build' }).click();
    const dialog = page.getByRole('dialog', { name: 'Build image from Dockerfile' });
    await expect(dialog.getByRole('textbox')).toHaveValue(tag);
    await dialog.getByRole('button', { name: 'Build' }).click();
    const tab = page.getByRole('tab', { name: new RegExp(tag) });
    await expect(tab).toContainText('built', { timeout: 60_000 });
    await expect(page.locator('[data-docker-output]:not([hidden]) .xterm-rows')).toContainText(
      `Built ${tag}.`,
    );
    await expect(
      page.getByRole('list', { name: 'Images' }).getByRole('listitem', { name: tag }),
    ).toBeVisible();
  });

  test('removes a running container only after confirmation', async () => {
    await row()
      .getByRole('button', { name: `Remove ${name}` })
      .click();
    const dialog = page.getByRole('dialog', {
      name: `Container “${name}” is running. Stop and remove it?`,
    });
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(row()).toBeVisible();
    await row()
      .getByRole('button', { name: `Remove ${name}` })
      .click();
    await page.getByRole('button', { name: 'Stop and remove' }).click();
    await expect(row()).toHaveCount(0, { timeout: 20_000 });
  });

  test('removes an image after confirmation', async () => {
    const images = page.getByRole('list', { name: 'Images' });
    await images.getByRole('button', { name: `Remove ${tag}` }).click();
    await page
      .getByRole('dialog', { name: `Remove image “${tag}”?` })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(images.getByRole('listitem', { name: tag })).toHaveCount(0);
  });
});
