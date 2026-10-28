import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubStatus } from '@kestrel/shared';
import type { FetchFn } from './deviceFlow';
import { GitHubService, TOKEN_KEY } from './service';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-github-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

interface FakeGitHub {
  /** Answer of the token endpoint. */
  token: unknown;
  /** Status of API calls (401 = token rejected). */
  apiStatus: number;
}

function setUp(clientId = 'client-1') {
  const github: FakeGitHub = { token: { access_token: 'gho_secret' }, apiStatus: 200 };
  const secrets = new Map<string, string>();
  const statuses: GitHubStatus[] = [];
  const logs: string[] = [];
  const opened: string[] = [];
  const fetchFn: FetchFn = (url) => {
    const path = new URL(url).pathname;
    if (path === '/login/device/code')
      return Promise.resolve(
        Response.json({
          device_code: 'dev',
          user_code: 'ABCD-1234',
          verification_uri: 'https://evil.test/phish',
          expires_in: 900,
          interval: 1,
        }),
      );
    if (path === '/login/oauth/access_token') return Promise.resolve(Response.json(github.token));
    if (github.apiStatus !== 200)
      return Promise.resolve(new Response('{}', { status: github.apiStatus }));
    if (path === '/user')
      return Promise.resolve(Response.json({ login: 'octo', name: 'Octo Cat' }));
    if (path === '/user/repos')
      return Promise.resolve(
        Response.json([
          {
            full_name: 'octo/hello',
            description: 'Hi',
            private: true,
            fork: false,
            archived: false,
            updated_at: '2026-10-01T00:00:00Z',
          },
          { full_name: '../evil', description: null, private: false, fork: false, updated_at: '' },
        ]),
      );
    return Promise.resolve(new Response('{}', { status: 404 }));
  };
  const service = new GitHubService({
    endpoints: { clientId, web: 'https://gh.test', api: 'https://api.gh.test' },
    fetch: fetchFn,
    secrets: {
      get: (key) => Promise.resolve(secrets.get(key) ?? null),
      set: (key, value) => {
        if (value === null) secrets.delete(key);
        else secrets.set(key, value);
        return Promise.resolve();
      },
    },
    accountFile: join(dir, 'github.json'),
    openExternal: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
    onChanged: (status) => statuses.push(status),
    log: (line) => logs.push(line),
    sleep: () => Promise.resolve(),
  });
  const settled = () =>
    vi.waitFor(() => {
      expect(statuses.at(-1)?.signIn).toBeNull();
    });
  return { service, github, secrets, statuses, logs, opened, settled };
}

describe('GitHubService', () => {
  it('signs in with the device flow and keeps the token out of status and logs', async () => {
    const { service, secrets, statuses, logs, opened, settled } = setUp();
    const code = await service.startSignIn();
    expect(code.userCode).toBe('ABCD-1234');
    // Only GitHub's own page is opened, not the one from the answer.
    expect(code.verificationUri).toBe('https://gh.test/login/device');
    expect(opened).toEqual(['https://gh.test/login/device']);
    await settled();
    expect(secrets.get(TOKEN_KEY)).toBe('gho_secret');
    expect(await service.status()).toMatchObject({
      configured: true,
      user: { login: 'octo', name: 'Octo Cat' },
      signIn: null,
      signInError: null,
    });
    expect(JSON.stringify(statuses) + logs.join('\n')).not.toContain('gho_secret');
  });

  it('reports a declined sign-in', async () => {
    const { service, github, settled } = setUp();
    github.token = { error: 'access_denied' };
    await service.startSignIn();
    await settled();
    expect(await service.status()).toMatchObject({ user: null, signInError: 'denied' });
  });

  it('lists repositories and skips names that are not owner/name', async () => {
    const { service, settled } = setUp();
    await service.startSignIn();
    await settled();
    expect(await service.repos()).toEqual([
      {
        fullName: 'octo/hello',
        description: 'Hi',
        private: true,
        fork: false,
        archived: false,
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ]);
    expect(service.cloneUrl('octo/hello')).toBe('https://gh.test/octo/hello.git');
  });

  it('signs out when GitHub rejects the token, and on request', async () => {
    const { service, github, secrets, settled } = setUp();
    await service.startSignIn();
    await settled();
    github.apiStatus = 401;
    await expect(service.repos()).rejects.toMatchObject({ code: 'github_auth' });
    expect(secrets.has(TOKEN_KEY)).toBe(false);
    expect((await service.status()).user).toBeNull();

    github.apiStatus = 200;
    await service.startSignIn();
    await settled();
    await service.signOut();
    expect(secrets.has(TOKEN_KEY)).toBe(false);
    await expect(service.repos()).rejects.toMatchObject({ code: 'github_auth' });
  });

  it('refuses to sign in without a client id', async () => {
    const { service } = setUp('');
    expect((await service.status()).configured).toBe(false);
    await expect(service.startSignIn()).rejects.toMatchObject({ code: 'github_not_configured' });
  });
});
