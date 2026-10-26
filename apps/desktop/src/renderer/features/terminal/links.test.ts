import { describe, expect, it } from 'vitest';
import { isLocalUrl } from './links';

describe('isLocalUrl', () => {
  it('recognizes local dev servers', () => {
    expect(isLocalUrl('http://localhost:5173/')).toBe(true);
    expect(isLocalUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalUrl('https://[::1]:8443/app')).toBe(true);
    expect(isLocalUrl('https://example.com')).toBe(false);
    expect(isLocalUrl('http://localhost.evil.com')).toBe(false);
  });
});
