import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@kestrel/shared';
import { createSettingsStore, parseSettings } from './index';

describe('parseSettings', () => {
  it('returns defaults for garbage', () => {
    expect(parseSettings(null)).toEqual(defaultSettings);
    expect(parseSettings('nope')).toEqual(defaultSettings);
  });

  it('only resets the broken key', () => {
    const parsed = parseSettings({ theme: 'light', language: 'klingon' });
    expect(parsed.theme).toBe('light');
    expect(parsed.language).toBe(defaultSettings.language);
  });
});

describe('createSettingsStore', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kestrel-settings-'));
    file = join(dir, 'nested', 'settings.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('starts with defaults when no file exists', async () => {
    const store = await createSettingsStore(file);
    expect(store.get()).toEqual(defaultSettings);
  });

  it('persists updates and notifies listeners', async () => {
    const store = await createSettingsStore(file);
    const listener = vi.fn();
    store.onChange(listener);

    await store.update({ theme: 'light' });

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light' }));
    const onDisk = JSON.parse(await readFile(file, 'utf8')) as { theme: string };
    expect(onDisk.theme).toBe('light');

    const reloaded = await createSettingsStore(file);
    expect(reloaded.get().theme).toBe('light');
  });

  it('ignores undefined values in a patch', async () => {
    const store = await createSettingsStore(file);
    await store.update({ theme: 'light' });
    await store.update({ theme: undefined, language: 'en' });
    expect(store.get()).toMatchObject({ theme: 'light', language: 'en' });
  });

  it('survives a corrupt file', async () => {
    await writeFile(join(dir, 'broken.json'), '{ not json');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = await createSettingsStore(join(dir, 'broken.json'));
    expect(store.get()).toEqual(defaultSettings);
  });
});
