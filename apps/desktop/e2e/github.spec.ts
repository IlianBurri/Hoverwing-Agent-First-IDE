import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { FAKE_GITHUB_TOKEN, FAKE_USER_CODE, startFakeGitHub } from './fake-github';
import type { FakeGitHub } from './fake-github';
import { createUserDataDir, launchApp } from './launch';
import { stubOpenDialog } from './workspace-helpers';

let app: ElectronApplication;
let page: Page;
let fake: FakeGitHub;
let userDataDir: string;
let clone: string;

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Kestrel Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Kestrel Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnv });

const dialog = () => page.getByRole('dialog', { name: 'GitHub' });

async function pushFromGitPanel(): Promise<void> {
  await page
    .getByRole('region', { name: 'Git' })
    .getByRole('button', { name: 'Push', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Push' }).click();
}

/** URLs Kestrel asked the system to open (the browser is not started in tests). */
async function openedUrls(): Promise<string[]> {
  return app.evaluate(() => (globalThis as { openedUrls?: string[] }).openedUrls ?? []);
}

test.beforeAll(async () => {
  fake = await startFakeGitHub();
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'kestrel-clones-')));
  clone = join(parent, 'demo');
  userDataDir = createUserDataDir();
  // Trusted from the start, so the Git panel can push from the clone.
  writeFileSync(join(userDataDir, 'trust.json'), JSON.stringify({ trusted: [clone] }));
  // No askpass program may pop up when git has no credentials.
  app = await launchApp(userDataDir, { ...fake.env, GIT_ASKPASS: '', SSH_ASKPASS: '' });
  page = await app.firstWindow();
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    Object.assign(globalThis, { openedUrls: opened });
    Object.assign(shell, {
      openExternal: (url: string) => {
        opened.push(url);
        return Promise.resolve();
      },
    });
  });
  await stubOpenDialog(app, parent);
});

test.afterAll(async () => {
  await app.close();
  await fake.close();
});

test('signs in with a device code', async () => {
  await page.getByRole('button', { name: 'Clone from GitHub …' }).click();
  await dialog().getByRole('button', { name: 'Sign in with GitHub' }).click();
  await expect(dialog().getByRole('status', { name: 'Sign-in code' })).toHaveText(FAKE_USER_CODE);
  expect(await openedUrls()).toEqual([`${fake.url}/login/device`]);

  fake.approve();
  await expect(dialog()).toContainText('Signed in as octo (Octo Cat)');
  const repos = dialog().getByRole('list', { name: 'Your repositories' });
  await expect(repos.getByRole('listitem', { name: 'octo/demo' })).toContainText(
    'A demo repository',
  );
  await expect(repos.getByRole('listitem', { name: 'octo/old-stuff' })).toContainText('archived');
  // The token stays in main.
  await expect(page.locator('body')).not.toContainText(FAKE_GITHUB_TOKEN);
  expect(readFileSync(join(userDataDir, 'github.json'), 'utf8')).not.toContain(FAKE_GITHUB_TOKEN);
});

test('filters and clones a repository and opens it', async () => {
  await dialog().getByRole('searchbox', { name: 'Search repositories' }).fill('demo');
  await expect(dialog().getByRole('listitem')).toHaveCount(1);
  await dialog().getByRole('button', { name: 'Clone octo/demo' }).click();
  await expect(dialog()).toHaveCount(0);
  await expect(
    page.getByRole('tree', { name: 'Files' }).getByRole('treeitem', { name: 'README.md' }),
  ).toBeVisible();
  // The remote stays a plain URL; nothing about the token lands in the project.
  expect(git(clone, 'remote', 'get-url', 'origin').trim()).toBe(`${fake.url}/octo/demo.git`);
  expect(readFileSync(join(clone, '.git', 'config'), 'utf8')).not.toContain(FAKE_GITHUB_TOKEN);
  expect(readFileSync(join(clone, '.git', 'config'), 'utf8')).not.toContain('credential');
});

test('pushes with the account from the Git panel', async () => {
  writeFileSync(join(clone, 'notes.md'), 'from Kestrel\n');
  git(clone, 'add', '.');
  git(clone, 'commit', '-qm', 'notes from Kestrel');
  await page.keyboard.press('Control+Shift+G');
  await pushFromGitPanel();
  await expect(page.getByText('Pushed.')).toBeVisible();
  expect(git(fake.repo, 'log', '--oneline', 'main')).toContain('notes from Kestrel');
});

test('signing out removes the account from git as well', async () => {
  await page.getByRole('button', { name: 'GitHub repositories …' }).click();
  await dialog().getByRole('button', { name: 'Sign out of GitHub' }).click();
  await expect(dialog().getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  await page.keyboard.press('Escape');

  writeFileSync(join(clone, 'more.md'), 'more\n');
  git(clone, 'add', '.');
  git(clone, 'commit', '-qm', 'after sign-out');
  const before = fake.gitAuthorizations.length;
  await pushFromGitPanel();
  await expect(page.getByText('Git could not sign in', { exact: false })).toBeVisible();
  expect(fake.gitAuthorizations.slice(before)).not.toContain(
    `Basic ${Buffer.from(`x-access-token:${FAKE_GITHUB_TOKEN}`).toString('base64')}`,
  );
  expect(git(fake.repo, 'log', '--oneline', 'main')).not.toContain('after sign-out');
});
