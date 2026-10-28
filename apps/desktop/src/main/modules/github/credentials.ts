import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * A git credential helper (dependency-free Node script). git runs it with
 * `get`; it asks Kestrel's broker over a local socket, proving it belongs to
 * a running git command with the key from KESTREL_GIT_CREDENTIALS. `store`
 * and `erase` do nothing: the token lives in Kestrel's secret store only.
 */
export const HELPER_SCRIPT = `// Kestrel git credential helper: answers for the GitHub account signed in to Kestrel.
import { connect } from 'node:net';

if (process.argv[2] !== 'get') process.exit(0);
const [port, key] = (process.env.KESTREL_GIT_CREDENTIALS || '').split(':');
if (!port || !key) process.exit(0);
setTimeout(() => process.exit(0), 10000).unref();

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  const fields = {};
  for (const line of input.split('\\n')) {
    const index = line.indexOf('=');
    if (index > 0) fields[line.slice(0, index)] = line.slice(index + 1).replace(/\\r$/, '');
  }
  const socket = connect(Number(port), '127.0.0.1');
  let answer = '';
  socket.setEncoding('utf8');
  socket.on('connect', () => {
    socket.write(JSON.stringify({ key, protocol: fields.protocol, host: fields.host }) + '\\n');
  });
  socket.on('data', (chunk) => {
    answer += chunk;
  });
  socket.on('error', () => process.exit(0));
  socket.on('end', () => {
    try {
      const { username, password } = JSON.parse(answer);
      if (username && password) process.stdout.write('username=' + username + '\\npassword=' + password + '\\n');
    } catch {}
    process.exit(0);
  });
});
`;

export const HELPER_FILE = 'git-credential-kestrel.mjs';

/** Writes the helper into `dir` and returns its path. */
export async function writeCredentialHelper(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, HELPER_FILE);
  await writeFile(path, HELPER_SCRIPT, { encoding: 'utf8', mode: 0o644 });
  return path;
}

/** Environment additions for one git command, released when it ends. */
export interface CredentialSession {
  env: Record<string, string>;
  release(): void;
}

export interface CredentialBrokerDeps {
  /** The GitHub web origin, e.g. "https://github.com"; only this host gets the token. */
  origin: string;
  /** The signed-in account's token, or null. */
  token: () => Promise<string | null>;
  /** Program and script that run the helper (Electron as Node, or node in tests). */
  helper: { program: string; script: string };
}

const MAX_REQUEST = 4096;

const helperRequestSchema = z.object({
  key: z.string().max(200),
  protocol: z.string().optional(),
  host: z.string().optional(),
});

/** Quotes for the POSIX shell git uses to run `!` helpers (Git for Windows too). */
export function shellQuote(value: string, platform: NodeJS.Platform = process.platform): string {
  const path = platform === 'win32' ? value.replace(/\\/g, '/') : value;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

/**
 * Hands the GitHub token to git without putting it into a URL, a config file
 * or a command line: each network command gets a one-off key in its
 * environment plus a credential helper scoped to the GitHub origin (through
 * GIT_CONFIG_* variables, so nothing is written to `.git/config`).
 */
export class GitCredentialBroker {
  private server: Server | null = null;
  private port = 0;
  private readonly keys = new Set<string>();
  private readonly url: URL;

  constructor(private readonly deps: CredentialBrokerDeps) {
    this.url = new URL(deps.origin);
  }

  async start(): Promise<void> {
    if (this.server) return;
    const server = createServer((socket) => {
      this.answer(socket);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });
    const address = server.address();
    this.port = typeof address === 'object' && address ? address.port : 0;
    this.server = server;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.keys.clear();
    if (server)
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
  }

  /**
   * Environment for one git network command, or null when nobody is signed
   * in (git then uses the user's own credential setup).
   */
  async session(base: Readonly<Record<string, string>>): Promise<CredentialSession | null> {
    if (!this.server || (await this.deps.token()) === null) return null;
    const key = randomBytes(24).toString('hex');
    this.keys.add(key);
    const origin = this.url.origin;
    const helper = `!ELECTRON_RUN_AS_NODE=1 ${shellQuote(this.deps.helper.program)} ${shellQuote(this.deps.helper.script)}`;
    const count = Number(base['GIT_CONFIG_COUNT'] ?? '0');
    const start = Number.isInteger(count) && count >= 0 ? count : 0;
    // An empty value clears the helpers configured before (for this origin),
    // so the signed-in account is used instead of a stored one.
    const entries: [string, string][] = [
      [`credential.${origin}.helper`, ''],
      [`credential.${origin}.helper`, helper],
    ];
    const env: Record<string, string> = {
      KESTREL_GIT_CREDENTIALS: `${String(this.port)}:${key}`,
      GIT_CONFIG_COUNT: String(start + entries.length),
    };
    entries.forEach(([name, value], index) => {
      env[`GIT_CONFIG_KEY_${String(start + index)}`] = name;
      env[`GIT_CONFIG_VALUE_${String(start + index)}`] = value;
    });
    return {
      env,
      release: () => {
        this.keys.delete(key);
      },
    };
  }

  private isKnownKey(key: string): boolean {
    const given = Buffer.from(key);
    for (const known of this.keys) {
      const expected = Buffer.from(known);
      if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
    }
    return false;
  }

  /** Answers one helper request: the token for the GitHub origin and a valid key only. */
  private answer(socket: Socket): void {
    let data = '';
    socket.setEncoding('utf8');
    socket.setTimeout(5000, () => socket.destroy());
    socket.on('error', () => undefined);
    socket.on('data', (chunk: string) => {
      data += chunk;
      if (data.length > MAX_REQUEST) {
        socket.destroy();
        return;
      }
      const newline = data.indexOf('\n');
      if (newline < 0) return;
      void this.reply(data.slice(0, newline)).then((reply) => {
        socket.end(`${JSON.stringify(reply)}\n`);
      });
    });
  }

  private async reply(line: string): Promise<Record<string, string>> {
    let parsed: z.infer<typeof helperRequestSchema>;
    try {
      parsed = helperRequestSchema.parse(JSON.parse(line));
    } catch {
      return {};
    }
    const { key, protocol, host } = parsed;
    if (!this.isKnownKey(key)) return {};
    if (protocol !== this.url.protocol.replace(/:$/, '') || host !== this.url.host) return {};
    const token = await this.deps.token();
    return token ? { username: 'x-access-token', password: token } : {};
  }
}
