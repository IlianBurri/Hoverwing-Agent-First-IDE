import { describe, expect, it } from 'vitest';
import { hardenedWebPreferences } from './webPreferences';

describe('hardenedWebPreferences', () => {
  it('enforces isolation, sandbox and no Node.js in the renderer', () => {
    expect(hardenedWebPreferences('/preload.cjs')).toMatchObject({
      preload: '/preload.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
  });
});
