import { describe, expect, it } from 'vitest';
import { isAllowedBrowserUrl, normalizeBrowserUrl } from './browser';

describe('normalizeBrowserUrl', () => {
  it('adds http for local addresses and https otherwise', () => {
    expect(normalizeBrowserUrl('localhost:3000')).toBe('http://localhost:3000/');
    expect(normalizeBrowserUrl('127.0.0.1:8080/app')).toBe('http://127.0.0.1:8080/app');
    expect(normalizeBrowserUrl('example.com')).toBe('https://example.com/');
    expect(normalizeBrowserUrl('  https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1');
    expect(normalizeBrowserUrl('myhost:8000')).toBe('https://myhost:8000/');
  });

  it('rejects other schemes and search-like text', () => {
    expect(normalizeBrowserUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeBrowserUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeBrowserUrl('chrome://settings')).toBeNull();
    expect(normalizeBrowserUrl('how to center a div')).toBeNull();
    expect(normalizeBrowserUrl('react')).toBeNull();
    expect(normalizeBrowserUrl('')).toBeNull();
  });
});

describe('isAllowedBrowserUrl', () => {
  it('allows only web pages', () => {
    expect(isAllowedBrowserUrl('https://example.com')).toBe(true);
    expect(isAllowedBrowserUrl('about:blank')).toBe(true);
    expect(isAllowedBrowserUrl('file:///tmp/x.html')).toBe(false);
    expect(isAllowedBrowserUrl('devtools://devtools')).toBe(false);
    expect(isAllowedBrowserUrl('not a url')).toBe(false);
  });
});
