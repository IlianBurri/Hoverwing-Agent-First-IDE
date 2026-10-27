import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileDiagnostics, LspServerStatus } from '@kestrel/shared';
import { LspConfigStore } from './configs';
import { LspService } from './service';
import type { LspServiceDeps } from './service';
import { spawnLspTransport } from './transport';

const fakeServer = join(import.meta.dirname, '../../../../e2e/fixtures/fake-lsp.mjs');
const OWNER = 7;

let dir: string;
let root: string;
let service: LspService | null = null;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-lsp-'));
  root = join(dir, 'project');
  await mkdir(root);
});

afterEach(async () => {
  service?.releaseAll();
  service = null;
  await rm(dir, { recursive: true, force: true });
});

async function setup(overrides: Partial<LspServiceDeps> = {}) {
  const configs = new LspConfigStore(join(dir, 'lsp'));
  await configs.put({
    id: 'fake',
    name: 'Fake',
    command: process.execPath,
    args: [fakeServer],
    extensions: ['fake'],
    enabled: true,
  });
  const diagnostics: FileDiagnostics[] = [];
  const statuses: LspServerStatus[][] = [];
  const confirmStart = vi.fn(() => Promise.resolve(true));
  service = new LspService({
    configs,
    isTrusted: () => Promise.resolve(true),
    confirmStart,
    programExists: () => Promise.resolve(true),
    startTransport: spawnLspTransport,
    env: () => ({ PATH: process.env['PATH'] ?? '' }),
    events: {
      diagnostics: (_owner, file) => diagnostics.push(file),
      status: (_owner, list) => statuses.push(list),
      log: () => undefined,
    },
    restartDelayMs: 10,
    ...overrides,
  });
  const state = () => statuses.at(-1)?.[0]?.state;
  return { service, configs, diagnostics, statuses, state, confirmStart };
}

const at = (line: number, character: number) => ({ line, character });

describe('LspService', () => {
  it('starts a server for a matching file, syncs text and answers requests', async () => {
    const { service, diagnostics, state, confirmStart } = await setup();
    expect(await service.open(OWNER, root, 'notes.txt', 'x', 1)).toEqual({ served: false });
    expect(await service.open(OWNER, root, 'a.fake', 'hello ERROR\n', 1)).toEqual({
      served: true,
    });
    await vi.waitFor(() => {
      expect(state()).toBe('ready');
    });
    expect(confirmStart).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(diagnostics.at(-1)?.diagnostics[0]).toMatchObject({
        severity: 'error',
        message: 'Fake error',
        source: 'fake-lsp',
        range: { start: at(0, 6), end: at(0, 11) },
      });
    });

    await service.change(OWNER, 'a.fake', 'WARN\nfine\n', 2);
    await vi.waitFor(() => {
      expect(diagnostics.at(-1)?.diagnostics.map((d) => d.severity)).toEqual(['warning']);
    });
    expect(service.diagnostics(OWNER)).toEqual([diagnostics.at(-1)]);

    const completion = await service.completion(OWNER, 'a.fake', at(1, 2), undefined, 'r1');
    expect(completion.items[0]).toMatchObject({
      label: 'fakeCompletion',
      insertText: 'fakeCompletion()',
    });
    expect(await service.hover(OWNER, 'a.fake', at(1, 1))).toEqual({
      contents: '**fake hover** for `fine`',
      range: null,
    });
    // The location outside the project is dropped.
    expect(await service.definition(OWNER, 'a.fake', at(1, 1))).toEqual([
      { path: 'a.fake', range: { start: at(1, 0), end: at(1, 4) } },
    ]);
    expect(
      (await service.signatureHelp(OWNER, 'a.fake', at(0, 0), '('))?.signatures[0]?.label,
    ).toBe('fake(a: number, b: string)');
    // Unknown documents give empty answers, not errors.
    expect(await service.hover(OWNER, 'other.fake', at(0, 0))).toBeNull();
  });

  it('does nothing in untrusted projects until trust is granted', async () => {
    let trusted = false;
    const { service, state } = await setup({ isTrusted: () => Promise.resolve(trusted) });
    expect(await service.open(OWNER, root, 'a.fake', 'ERROR', 1)).toEqual({ served: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(service.statuses(OWNER)).toEqual([]);

    trusted = true;
    await service.trustChanged(root, true);
    await vi.waitFor(() => {
      expect(state()).toBe('ready');
    });
    await vi.waitFor(() => {
      expect(service.diagnostics(OWNER)).toHaveLength(1);
    });

    trusted = false;
    await service.trustChanged(root, false);
    expect(service.statuses(OWNER)).toEqual([]);
    expect(service.diagnostics(OWNER)).toEqual([]);
  });

  it('remembers a declined start and a missing program', async () => {
    const declined = await setup({ confirmStart: () => Promise.resolve(false) });
    await declined.service.open(OWNER, root, 'a.fake', '', 1);
    await vi.waitFor(() => {
      expect(declined.state()).toBe('declined');
    });
    service?.releaseAll();

    const missing = await setup({ programExists: () => Promise.resolve(false) });
    await missing.service.open(OWNER, root, 'a.fake', '', 1);
    await vi.waitFor(() => {
      expect(missing.state()).toBe('missing');
    });
  });

  it('never sends secret files to a server', async () => {
    const { service, configs } = await setup();
    await configs.put({
      id: 'fake',
      name: 'Fake',
      command: process.execPath,
      args: [fakeServer],
      extensions: ['env', 'fake'],
      enabled: true,
    });
    expect(await service.open(OWNER, root, '.env', 'SECRET=1', 1)).toEqual({ served: false });
  });

  it('restarts a crashed server and opens its documents again', async () => {
    const { service, state, diagnostics } = await setup();
    await service.open(OWNER, root, 'a.fake', 'ok', 1);
    await vi.waitFor(() => {
      expect(state()).toBe('ready');
    });
    await service.change(OWNER, 'a.fake', 'CRASH', 2);
    await vi.waitFor(() => {
      expect(state()).toBe('starting');
    });
    // Fix the text while it restarts: the new server gets the current version.
    await service.change(OWNER, 'a.fake', 'ERROR', 3);
    await vi.waitFor(() => {
      expect(state()).toBe('ready');
    });
    await vi.waitFor(() => {
      expect(diagnostics.at(-1)?.diagnostics).toHaveLength(1);
    });
  });
});
