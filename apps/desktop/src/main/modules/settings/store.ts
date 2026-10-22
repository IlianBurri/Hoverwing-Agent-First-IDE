import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { applySettingsPatch } from '@kestrel/shared';
import type { Settings } from '@kestrel/shared';
import { parseSettings } from './parse';

/** Keys that are missing or undefined stay unchanged. */
export type SettingsUpdate = { [K in keyof Settings]?: Settings[K] | undefined };

export type SettingsListener = (settings: Settings) => void;

export interface SettingsStore {
  get(): Settings;
  update(patch: SettingsUpdate): Promise<Settings>;
  onChange(listener: SettingsListener): () => void;
}

/**
 * Loads settings from a JSON file and writes changes atomically
 * (temp file + rename), so a crash never leaves a half-written file.
 */
export async function createSettingsStore(filePath: string): Promise<SettingsStore> {
  let current = await load(filePath);
  let writeQueue: Promise<void> = Promise.resolve();
  const listeners = new Set<SettingsListener>();

  return {
    get: () => current,
    async update(patch) {
      current = parseSettings(applySettingsPatch(current, patch));
      const snapshot = current;
      writeQueue = writeQueue
        .then(() => save(filePath, snapshot))
        .catch((error: unknown) => {
          console.error('[settings] could not save settings', error);
        });
      await writeQueue;
      for (const listener of listeners) listener(snapshot);
      return snapshot;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

async function load(filePath: string): Promise<Settings> {
  try {
    return parseSettings(JSON.parse(await readFile(filePath, 'utf8')));
  } catch (error) {
    if (!isMissingFile(error)) console.warn('[settings] unreadable settings file, using defaults');
    return parseSettings({});
  }
}

async function save(filePath: string, settings: Settings): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
