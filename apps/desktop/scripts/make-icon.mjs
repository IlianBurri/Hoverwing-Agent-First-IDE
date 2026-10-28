/**
 * Renders the app icon (build/icon.png, 512×512) from the Hoverwing mark.
 * electron-builder turns it into .ico/.icns. Run it again after changing
 * the mark: `npx electron scripts/make-icon.mjs`
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow, app } from 'electron';

const SIZE = 512;
// Same paths as src/renderer/components/KestrelMark, on the dark accent.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b5bdb"/>
      <stop offset="1" stop-color="#1e2a5a"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="46" height="46" rx="10" fill="url(#bg)"/>
  <g transform="translate(1 1.5)">
    <path d="M6 30C14 18 24 12 42 10C34 16 30 22 28 30C24 26 16 26 6 30Z" fill="#ffffff" opacity="0.95"/>
    <path d="M28 30C27 34 25 37 22 39C24 35 24 32 23 29Z" fill="#ffffff" opacity="0.6"/>
  </g>
</svg>`;

app.disableHardwareAcceleration();
// No top-level await: the ready event waits for the entry module to finish.
void app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  await window.loadURL(
    `data:text/html,${encodeURIComponent(
      `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
    )}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  const out = join(import.meta.dirname, '..', 'build');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'icon.png'), image.resize({ width: SIZE, height: SIZE }).toPNG());
  console.log('wrote build/icon.png');
  app.quit();
});
