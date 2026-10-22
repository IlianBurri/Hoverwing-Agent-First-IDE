import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, devContentSecurityPolicy, isAppUrl } from './security';

describe('isAppUrl', () => {
  const fileApp = 'file:///opt/kestrel/out/renderer/index.html';

  it('allows only the app page for file:// builds', () => {
    expect(isAppUrl(fileApp, fileApp)).toBe(true);
    expect(isAppUrl('file:///etc/passwd', fileApp)).toBe(false);
    expect(isAppUrl('https://example.com', fileApp)).toBe(false);
  });

  it('allows only the dev server origin in development', () => {
    const dev = 'http://localhost:5173';
    expect(isAppUrl('http://localhost:5173/index.html', dev)).toBe(true);
    expect(isAppUrl('http://localhost:9999', dev)).toBe(false);
  });

  it('treats invalid URLs as foreign', () => {
    expect(isAppUrl('not a url', fileApp)).toBe(false);
  });
});

describe('content security policy', () => {
  it('forbids remote and inline scripts in production', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval');
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
  });

  it('only opens the dev server origin in development', () => {
    const csp = devContentSecurityPolicy('http://localhost:5173/');
    expect(csp).toContain("connect-src 'self' http://localhost:5173 ws://localhost:5173");
    expect(csp).not.toContain('*');
  });
});
