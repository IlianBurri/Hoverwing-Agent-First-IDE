import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrustStore } from './store';

let dir = '';
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('TrustStore', () => {
  it('starts untrusted, remembers trust across instances and reports changes', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kestrel-trust-'));
    const file = join(dir, 'trust.json');
    const store = new TrustStore(file);
    const listener = vi.fn();
    store.onChange(listener);

    expect(await store.isTrusted('/projects/a')).toBe(false);
    await store.set('/projects/a', true);
    await store.set('/projects/a', true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('/projects/a', true);

    expect(await new TrustStore(file).isTrusted('/projects/a')).toBe(true);
    expect(await new TrustStore(file).isTrusted('/projects')).toBe(false);

    await store.set('/projects/a', false);
    expect(listener).toHaveBeenLastCalledWith('/projects/a', false);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ trusted: [] });
  });

  it('treats a broken file as "nothing trusted"', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kestrel-trust-'));
    const file = join(dir, 'trust.json');
    await writeFile(file, '{oops');
    expect(await new TrustStore(file).isTrusted('/x')).toBe(false);
  });
});
