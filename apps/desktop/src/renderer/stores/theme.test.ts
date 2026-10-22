import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('uses the explicit preference', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('follows the system when asked to', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
