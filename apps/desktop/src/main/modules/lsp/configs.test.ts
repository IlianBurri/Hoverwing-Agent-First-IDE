import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_SERVERS, LspConfigStore, serverFingerprint } from './configs';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-lsp-configs-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('LspConfigStore', () => {
  it('lists the templates, unapproved, and picks servers by extension', async () => {
    const store = new LspConfigStore(dir);
    const list = await store.list();
    expect(list.map((server) => server.id)).toEqual(BUILTIN_SERVERS.map((server) => server.id));
    expect(list.every((server) => server.builtin && !server.approved)).toBe(true);
    expect((await store.forPath('src/App.TSX'))?.id).toBe('typescript');
    expect((await store.forPath('main.py'))?.id).toBe('python');
    expect(await store.forPath('README.md')).toBeUndefined();
    expect(await store.forPath('Makefile')).toBeUndefined();
  });

  it('overrides and resets builtins, adds custom servers, and keeps approvals per command line', async () => {
    const store = new LspConfigStore(dir);
    const python = BUILTIN_SERVERS.find((server) => server.id === 'python');
    if (!python) throw new Error('missing template');
    await store.put({ ...python, enabled: false });
    expect(await store.forPath('a.py')).toBeUndefined();

    await store.put({
      id: 'lua',
      name: 'Lua',
      command: 'lua-language-server',
      args: [],
      extensions: ['lua'],
      enabled: true,
    });
    const lua = await store.get('lua');
    expect(lua).toMatchObject({ builtin: false, approved: false });
    if (!lua) throw new Error('missing');
    await store.approve(lua);
    expect((await new LspConfigStore(dir).get('lua'))?.approved).toBe(true);

    // A changed command line needs a new confirmation.
    await store.put({ ...lua, args: ['--other'] });
    expect((await store.get('lua'))?.approved).toBe(false);
    expect(serverFingerprint(lua)).not.toBe(serverFingerprint({ ...lua, args: ['--other'] }));

    await store.remove('python');
    expect((await store.forPath('a.py'))?.enabled).toBe(true);
    await store.remove('lua');
    expect(await store.get('lua')).toBeUndefined();
  });
});
