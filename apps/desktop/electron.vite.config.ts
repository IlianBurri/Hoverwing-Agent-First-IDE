import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { CONTENT_SECURITY_POLICY } from './src/main/security';

/**
 * Production builds load from file://, where response headers cannot be
 * injected reliably, so the CSP is also embedded as a <meta> tag. In dev the
 * main process sets a relaxed CSP header for the Vite dev server instead.
 */
function cspMetaPlugin(): Plugin {
  return {
    name: 'kestrel-csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  main: {
    build: {
      // Bundle the workspace package; real npm deps stay external.
      externalizeDeps: { exclude: ['@kestrel/shared'] },
    },
  },
  preload: {
    build: {
      externalizeDeps: { exclude: ['@kestrel/shared'] },
      rolldownOptions: {
        // Sandboxed preloads must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    plugins: [react(), cspMetaPlugin()],
    build: {
      rolldownOptions: {
        input: resolve(import.meta.dirname, 'src/renderer/index.html'),
      },
    },
  },
});
