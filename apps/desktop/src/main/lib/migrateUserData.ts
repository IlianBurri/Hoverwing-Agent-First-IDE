import { cpSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

/** Chromium caches and locks: rebuilt on start, never worth copying. */
const SKIPPED = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'Crashpad',
  'blob_storage',
  'Shared Dictionary',
  'SingletonLock',
  'SingletonSocket',
  'SingletonCookie',
]);

/** Written on every start, so it marks a folder the app has really used. */
const MARKER = 'settings.json';

/**
 * Takes over the app data of the previous product name (Kestrel → Hoverwing)
 * once: copies the old folder while the new one has no settings yet (Electron
 * creates the folder itself before the main script runs, so its mere
 * existence says nothing). Files already there are kept. Copying, not moving,
 * keeps an older installed version working. Returns whether it copied. Runs
 * before `app.ready`, so it is synchronous.
 */
export function migrateUserData(oldDir: string, newDir: string): boolean {
  if (existsSync(join(newDir, MARKER)) || !existsSync(join(oldDir, MARKER))) return false;
  cpSync(oldDir, newDir, {
    recursive: true,
    force: false,
    // Symlinks (Chromium's singleton files on Linux) are skipped with the caches.
    verbatimSymlinks: true,
    filter: (source) => source === oldDir || !SKIPPED.has(basename(source)),
  });
  return true;
}
