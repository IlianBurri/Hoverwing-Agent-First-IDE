import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { childEnv } from '../../lib/env';
import { GitCredentialBroker, shellQuote, writeCredentialHelper } from './credentials';

let dir: string;
let broker: GitCredentialBroker;
let token: string | null;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-credentials-'));
  token = 'gho_test_token';
  broker = new GitCredentialBroker({
    origin: 'https://github.com',
    token: () => Promise.resolve(token),
    helper: { program: process.execPath, script: await writeCredentialHelper(dir) },
  });
  await broker.start();
});

afterEach(async () => {
  await broker.stop();
  await rm(dir, { recursive: true, force: true });
});

/** What `git credential fill` answers for a URL with the given extra environment. */
function fill(url: string, extra: Record<string, string>): Promise<string> {
  const { protocol, host } = new URL(url);
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      ['credential', 'fill'],
      {
        cwd: dir,
        env: {
          ...childEnv(process.env),
          // No other helper or prompt may answer in the test.
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: join(dir, 'no-gitconfig'),
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: '',
          SSH_ASKPASS: '',
          ...extra,
        },
      },
      (_error, stdout) => {
        resolve(stdout);
      },
    );
    child.stdin?.end(`protocol=${protocol.replace(':', '')}\nhost=${host}\n\n`);
  });
}

describe('GitCredentialBroker', () => {
  it('gives git the token for github.com through the helper', async () => {
    const session = await broker.session({});
    if (!session) throw new Error('no session');
    const answer = await fill('https://github.com/owner/repo.git', session.env);
    expect(answer).toContain('username=x-access-token');
    expect(answer).toContain('password=gho_test_token');
    session.release();
  });

  it('answers no other host', async () => {
    const session = await broker.session({});
    if (!session) throw new Error('no session');
    const answer = await fill('https://example.com/owner/repo.git', session.env);
    expect(answer).not.toContain('gho_test_token');
    session.release();
  });

  it('stops answering once the command ended', async () => {
    const session = await broker.session({});
    if (!session) throw new Error('no session');
    session.release();
    expect(await fill('https://github.com/owner/repo.git', session.env)).not.toContain(
      'gho_test_token',
    );
  });

  it('refuses a wrong key', async () => {
    const session = await broker.session({});
    if (!session) throw new Error('no session');
    const env = {
      ...session.env,
      KESTREL_GIT_CREDENTIALS: `${session.env['KESTREL_GIT_CREDENTIALS']?.split(':')[0] ?? ''}:wrong`,
    };
    expect(await fill('https://github.com/owner/repo.git', env)).not.toContain('gho_test_token');
    session.release();
  });

  it('adds nothing while signed out', async () => {
    token = null;
    expect(await broker.session({})).toBeNull();
  });

  it('appends to configuration the user passes in the environment', async () => {
    const session = await broker.session({ GIT_CONFIG_COUNT: '2' });
    expect(session?.env).toMatchObject({
      GIT_CONFIG_COUNT: '4',
      GIT_CONFIG_KEY_2: 'credential.https://github.com.helper',
      GIT_CONFIG_VALUE_2: '',
      GIT_CONFIG_KEY_3: 'credential.https://github.com.helper',
    });
    // The token itself is never part of the environment or the configuration.
    expect(JSON.stringify(session?.env)).not.toContain('gho_test_token');
    session?.release();
  });
});

describe('shellQuote', () => {
  it('quotes for sh and uses forward slashes on Windows', () => {
    expect(shellQuote("/opt/it's here/node", 'linux')).toBe(`'/opt/it'\\''s here/node'`);
    expect(shellQuote('C:\\Program Files\\Kestrel\\Kestrel.exe', 'win32')).toBe(
      `'C:/Program Files/Kestrel/Kestrel.exe'`,
    );
  });
});
