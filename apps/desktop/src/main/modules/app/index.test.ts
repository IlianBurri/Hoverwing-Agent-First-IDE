import { describe, expect, it } from 'vitest';
import { toAppInfo } from './index';

describe('toAppInfo', () => {
  it('passes through known platforms', () => {
    const info = toAppInfo({ name: 'Kestrel', version: '1.0.0', platform: 'linux', locale: 'de' });
    expect(info).toEqual({ name: 'Kestrel', version: '1.0.0', platform: 'linux', locale: 'de' });
  });

  it('maps unknown platforms to "other"', () => {
    const info = toAppInfo({ name: 'Kestrel', version: '1.0.0', platform: 'aix', locale: 'en' });
    expect(info.platform).toBe('other');
  });
});
