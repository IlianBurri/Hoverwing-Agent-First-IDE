/**
 * Refreshes the Windows update feed after the installer was signed.
 * Signing changes the file, so the SHA-512 and size in latest.yml and the
 * .blockmap (differential updates) no longer match; electron-updater would
 * reject the update. Rebuilds both with electron-builder's own blockmap code.
 *
 *   node scripts/update-win-feed.mjs release/Hoverwing-Setup-<version>.exe
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';

const installer = process.argv[2];
if (!installer) throw new Error('usage: update-win-feed.mjs <installer.exe>');

// app-builder-lib is electron-builder's dependency (same pinned version).
const fromBuilder = createRequire(createRequire(import.meta.url).resolve('electron-builder'));
const { buildBlockMap } = fromBuilder('app-builder-lib/out/targets/blockmap/blockmap.js');
const { sha512, size } = await buildBlockMap(installer, 'gzip', `${installer}.blockmap`);

const feedFile = join(dirname(installer), 'latest.yml');
const name = basename(installer);
const lines = readFileSync(feedFile, 'utf8').split('\n');
let inEntry = false;
let found = 0;
// The file entry (`- url: <name>` with sha512 + size) and the top-level sha512.
const replace = (line, pattern, value) => {
  found++;
  return line.replace(pattern, value);
};
const updated = lines.map((line) => {
  if (/^\s*- url: /.test(line)) inEntry = line.trim() === `- url: ${name}`;
  if (inEntry && /^\s+sha512: /.test(line)) return replace(line, /sha512: .*/, `sha512: ${sha512}`);
  if (inEntry && /^\s+size: /.test(line)) return replace(line, /size: .*/, `size: ${size}`);
  if (/^sha512: /.test(line)) return replace(line, /sha512: .*/, `sha512: ${sha512}`);
  return line;
});
if (found !== 3) throw new Error(`latest.yml has no complete entry for ${name}`);
writeFileSync(feedFile, updated.join('\n'));
console.log(`latest.yml: ${name} ${size} bytes, sha512 ${sha512}`);
