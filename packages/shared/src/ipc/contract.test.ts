import { describe, expect, it } from 'vitest';
import { ipcChannels, ipcContract, ipcEventNames, isIpcChannel, isIpcEvent } from './contract';

describe('ipcContract', () => {
  it('uses namespaced channel and event names', () => {
    for (const channel of [...ipcChannels, ...ipcEventNames]) {
      expect(channel).toMatch(/^[a-z]+:[a-zA-Z]+$/);
    }
  });

  it('recognizes known channels only', () => {
    expect(isIpcChannel('app:getInfo')).toBe(true);
    expect(isIpcChannel('shell:exec')).toBe(false);
    expect(isIpcChannel('toString')).toBe(false);
    expect(isIpcChannel(42)).toBe(false);
    expect(isIpcEvent('settings:changed')).toBe(true);
    expect(isIpcEvent('app:getInfo')).toBe(false);
  });

  it('rejects malformed app:getInfo responses', () => {
    const schema = ipcContract['app:getInfo'].response;
    expect(schema.safeParse({ name: 'Hoverwing' }).success).toBe(false);
    expect(
      schema.safeParse({ name: 'Hoverwing', version: '0.0.0', platform: 'linux', locale: 'de' })
        .success,
    ).toBe(true);
  });
});

describe('app:openExternalUrl', () => {
  const schema = ipcContract['app:openExternalUrl'].request;

  it('accepts web links only', () => {
    expect(schema.safeParse({ url: 'https://example.com/docs' }).success).toBe(true);
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'ms-settings:', 'https://']) {
      expect(schema.safeParse({ url }).success).toBe(false);
    }
  });
});
