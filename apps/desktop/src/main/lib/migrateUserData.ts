import { cpSync, existsSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';

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

/**
 * Takes over the app data of the previous product name (Kestrel → Hoverwing)
 * once: copies the old folder when the new one does not exist yet. Copying,
 * not moving, keeps an older installed version working. Returns whether it
 * copied. Runs before `app.ready`, so it is synchronous.
 */
export function migrateUserData(oldDir: string, newDir: string): boolean {
  if (existsSync(newDir) || !existsSync(oldDir)) return false;
  if (readdirSync(oldDir).length === 0) return false;
  cpSync(oldDir, newDir, {
    recursive: true,
    // Symlinks (Chromium's singleton files on Linux) are skipped with the caches.
    verbatimSymlinks: true,
    filter: (source) => source === oldDir || !SKIPPED.has(basename(source)),
  });
  return true;
}
