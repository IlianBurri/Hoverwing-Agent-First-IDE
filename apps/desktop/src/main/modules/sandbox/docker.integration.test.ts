import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultAgentSandbox } from '@kestrel/shared';
import { classifyDockerError, createDockerApi, DEFAULT_SANDBOX_PACKAGES } from '../docker';
import { SandboxService } from './service';

/**
 * Runs against a real Docker daemon. Opt in with KESTREL_DOCKER_TESTS=1;
 * KESTREL_SANDBOX_BASE_IMAGE picks the base (e.g. a mirror) and
 * KESTREL_SANDBOX_PACKAGES="" skips apt where Debian is unreachable.
 */
const enabled = process.env['KESTREL_DOCKER_TESTS'] === '1';
const baseImage = process.env['KESTREL_SANDBOX_BASE_IMAGE'] ?? 'node:22-bookworm-slim';
const packages =
  process.env['KESTREL_SANDBOX_PACKAGES']?.split(/\s+/).filter(Boolean) ?? DEFAULT_SANDBOX_PACKAGES;

let dataDir: string;
let project: string;

describe.skipIf(!enabled)('sandbox with real Docker', () => {
  const logs: string[] = [];
  let sandbox: SandboxService;

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'kestrel-docker-'));
    project = await mkdtemp(join(tmpdir(), 'kestrel-docker-project-'));
    await writeFile(join(project, '.env'), 'TOKEN=secret');
    await mkdir(join(project, '.ssh'));
    await writeFile(join(project, '.ssh', 'id_ed25519'), 'key');
    await writeFile(join(project, 'hello.txt'), 'hello');
    sandbox = new SandboxService({
      docker: createDockerApi({ socketPath: undefined }),
      dataDir,
      platform: process.platform,
      identity: { uid: process.getuid?.() ?? null, gid: process.getgid?.() ?? null },
      hostEnv: {},
      isInstalled: () => Promise.resolve(true),
      classifyError: classifyDockerError,
      baseImage: () => baseImage,
      packages,
      instance: 'integration-test',
      onLog: (line) => logs.push(line),
      onStatus: () => undefined,
      mcpBridge: () => null,
    });
  });

  afterAll(async () => {
    await rm(dataDir, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  });

  it('builds the image', { timeout: 300_000 }, async () => {
    const status = await sandbox.prepare();
    expect(status).toMatchObject({ docker: 'available', imageReady: true });
    expect(logs.length).toBeGreaterThan(0);
  });

  it('runs a program that sees the project but not its secrets', { timeout: 60_000 }, async () => {
    const script = `
      const fs = require('node:fs');
      const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return e.code; } };
      const write = (p) => { try { fs.writeFileSync(p, 'x'); return 'ok'; } catch (e) { return e.code; } };
      process.stdin.once('data', (input) => {
        console.error('to stderr');
        console.log(JSON.stringify({
          input: input.toString().trim(),
          hello: read('hello.txt'),
          env: read('.env'),
          ssh: read('.ssh/id_ed25519'),
          home: process.env.HOME,
          rootFs: write('/usr/kestrel-test'),
          project: write('created.txt'),
        }));
        process.exit(0);
      });`;
    const launch = await sandbox.startAgent(
      {
        id: 'integration',
        name: 'Integration',
        command: 'node',
        args: ['-e', script],
        env: [],
        reviewChanges: false,
        sandbox: { ...defaultAgentSandbox, enabled: true, memoryMb: 512, cpus: 1 },
      },
      project,
      {},
    );
    const stderr: string[] = [];
    launch.transport.onStderr((line) => stderr.push(line));
    const exited = new Promise((resolve) => {
      launch.transport.onExit(resolve);
    });
    const writer = launch.transport.stream.writable.getWriter();
    await writer.write({ jsonrpc: '2.0', method: 'ping' });
    const reader = launch.transport.stream.readable.getReader();
    // The script answers with plain JSON (not JSON-RPC); ndJsonStream still parses it.
    const { value } = await reader.read();
    expect(await exited).toBe(0);
    expect(value).toMatchObject({
      input: '{"jsonrpc":"2.0","method":"ping"}',
      hello: 'hello',
      env: '',
      home: '/home/kestrel',
      rootFs: 'EROFS',
      project: 'ok',
    });
    expect(JSON.stringify(value)).toMatch(/"ssh":"(ENOENT|EACCES)"/);
    expect(stderr).toContain('to stderr');
    // Written as the host user, so the file stays editable outside.
    expect(await readFile(join(project, 'created.txt'), 'utf8')).toBe('x');
    expect(await readFile(join(project, '.env'), 'utf8')).toBe('TOKEN=secret');
  });
});
