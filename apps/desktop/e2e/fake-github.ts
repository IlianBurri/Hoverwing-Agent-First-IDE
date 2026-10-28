import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FAKE_GITHUB_TOKEN = 'gho_fakeTokenForKestrelE2E';
export const FAKE_USER_CODE = 'WDJB-MJHT';

export interface FakeGitHub {
  url: string;
  /** Environment that points Kestrel at this fake GitHub. */
  env: Record<string, string>;
  /** The bare repository behind `octo/demo`. */
  repo: string;
  /** The user confirms the code on "GitHub". */
  approve(): void;
  /** Authorization headers of git requests (to check what git sent). */
  gitAuthorizations: string[];
  close(): Promise<void>;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

/** Serves git's smart HTTP protocol with `git http-backend` (CGI). */
async function gitBackend(
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  const body = await readBody(request);
  const child = spawn('git', ['http-backend'], {
    env: {
      ...process.env,
      GIT_PROJECT_ROOT: root,
      GIT_HTTP_EXPORT_ALL: '1',
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search.slice(1),
      REQUEST_METHOD: request.method ?? 'GET',
      CONTENT_TYPE: request.headers['content-type'] ?? '',
      CONTENT_LENGTH: String(body.length),
      // Authenticated: http-backend then allows pushes (receive-pack).
      REMOTE_USER: 'x-access-token',
      REMOTE_ADDR: '127.0.0.1',
    },
  });
  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  child.stdin.end(body);
  await new Promise((resolve) => child.on('close', resolve));
  const output = Buffer.concat(chunks);
  const split = output.indexOf('\r\n\r\n');
  const head = output.subarray(0, split).toString('utf8');
  let status = 200;
  const headers: Record<string, string> = {};
  for (const line of head.split('\r\n')) {
    const colon = line.indexOf(':');
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (name.toLowerCase() === 'status') status = Number(value.split(' ')[0]);
    else if (name) headers[name] = value;
  }
  response.writeHead(status, headers);
  response.end(output.subarray(split + 4));
}

/**
 * A small GitHub: device flow (github.com/login/…), the REST API under /api
 * and the repository `octo/demo` over smart HTTP, which needs the token as
 * Basic auth like github.com does.
 */
export async function startFakeGitHub(): Promise<FakeGitHub> {
  const reposRoot = mkdtempSync(join(tmpdir(), 'kestrel-fake-github-'));
  const repo = join(reposRoot, 'octo', 'demo.git');
  const seed = mkdtempSync(join(tmpdir(), 'kestrel-fake-github-seed-'));
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Octo',
    GIT_AUTHOR_EMAIL: 'octo@example.com',
    GIT_COMMITTER_NAME: 'Octo',
    GIT_COMMITTER_EMAIL: 'octo@example.com',
  };
  execFileSync('git', ['init', '-q', '-b', 'main', seed], { env: gitEnv });
  writeFileSync(join(seed, 'README.md'), '# demo\n');
  execFileSync('git', ['add', '.'], { cwd: seed, env: gitEnv });
  execFileSync('git', ['commit', '-qm', 'initial'], { cwd: seed, env: gitEnv });
  execFileSync('git', ['clone', '-q', '--bare', seed, repo], { env: gitEnv });

  let approved = false;
  const gitAuthorizations: string[] = [];
  const expectedBasic = `Basic ${Buffer.from(`x-access-token:${FAKE_GITHUB_TOKEN}`).toString('base64')}`;

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const path = url.pathname;
      if (path === '/login/device/code') {
        await readBody(request);
        json(response, 200, {
          device_code: 'device-1',
          user_code: FAKE_USER_CODE,
          verification_uri: `${base}/login/device`,
          expires_in: 900,
          interval: 1,
        });
      } else if (path === '/login/oauth/access_token') {
        await readBody(request);
        json(
          response,
          200,
          approved ? { access_token: FAKE_GITHUB_TOKEN } : { error: 'authorization_pending' },
        );
      } else if (path.startsWith('/api/')) {
        if (request.headers.authorization !== `Bearer ${FAKE_GITHUB_TOKEN}`) {
          json(response, 401, { message: 'Bad credentials' });
        } else if (path === '/api/user') {
          json(response, 200, { login: 'octo', name: 'Octo Cat' });
        } else if (path === '/api/user/repos') {
          json(response, 200, [
            {
              full_name: 'octo/demo',
              description: 'A demo repository',
              private: true,
              fork: false,
              archived: false,
              updated_at: '2026-10-20T10:00:00Z',
            },
            {
              full_name: 'octo/old-stuff',
              description: null,
              private: false,
              fork: false,
              archived: true,
              updated_at: '2020-01-01T00:00:00Z',
            },
          ]);
        } else {
          json(response, 404, { message: 'Not Found' });
        }
      } else if (path.startsWith('/octo/demo.git/')) {
        const authorization = request.headers.authorization ?? '';
        gitAuthorizations.push(authorization);
        if (authorization !== expectedBasic) {
          response.writeHead(401, { 'www-authenticate': 'Basic realm="GitHub"' });
          response.end();
          return;
        }
        await gitBackend(reposRoot, request, response, url);
      } else {
        json(response, 404, { message: 'Not Found' });
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${String(port)}`;
  return {
    url: base,
    env: {
      KESTREL_GITHUB_CLIENT_ID: 'test-client',
      KESTREL_GITHUB_URL: base,
      KESTREL_GITHUB_API_URL: `${base}/api`,
    },
    repo,
    approve: () => {
      approved = true;
    },
    gitAuthorizations,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}
