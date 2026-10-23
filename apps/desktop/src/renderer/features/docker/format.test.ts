import { describe, expect, it } from 'vitest';
import { formatBytes, portUrl, suggestTag } from './format';

describe('suggestTag', () => {
  it('derives a valid tag from project and Dockerfile', () => {
    expect(suggestTag('Shop', 'Dockerfile')).toBe('shop:latest');
    expect(suggestTag('My Shop', 'services/api/Dockerfile.dev')).toBe('my-shop-api:dev');
    expect(suggestTag('shop', 'web.Dockerfile')).toBe('shop:web');
    expect(suggestTag('Über!', 'Dockerfile')).toBe('ber:latest');
    expect(suggestTag('', 'Dockerfile')).toBe('app:latest');
  });
});

describe('formatBytes', () => {
  it('uses readable units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(123_456_789)).toBe('118 MB');
  });
});

describe('portUrl', () => {
  it('only links published TCP ports', () => {
    expect(portUrl({ publicPort: 8080, protocol: 'tcp' })).toBe('http://localhost:8080');
    expect(portUrl({ publicPort: null, protocol: 'tcp' })).toBeNull();
    expect(portUrl({ publicPort: 53, protocol: 'udp' })).toBeNull();
  });
});
