import { describe, expect, it } from 'vitest';
import { ipcChannels, ipcContract, isIpcChannel } from './contract';

describe('ipcContract', () => {
  it('uses namespaced channel names', () => {
    for (const channel of ipcChannels) {
      expect(channel).toMatch(/^[a-z]+:[a-zA-Z]+$/);
    }
  });

  it('recognizes known channels only', () => {
    expect(isIpcChannel('app:getInfo')).toBe(true);
    expect(isIpcChannel('shell:exec')).toBe(false);
    expect(isIpcChannel('toString')).toBe(false);
    expect(isIpcChannel(42)).toBe(false);
  });

  it('rejects malformed app:getInfo responses', () => {
    const schema = ipcContract['app:getInfo'].response;
    expect(schema.safeParse({ name: 'Kestrel' }).success).toBe(false);
    expect(
      schema.safeParse({ name: 'Kestrel', version: '0.0.0', platform: 'linux', locale: 'de' })
        .success,
    ).toBe(true);
  });
});
