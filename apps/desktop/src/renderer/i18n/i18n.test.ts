import { describe, expect, it } from 'vitest';
import de from './locales/de.json';
import en from './locales/en.json';
import { pickLanguage } from './index';

function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('i18n', () => {
  it('has the same keys in every language', () => {
    expect(keysOf(en).sort()).toEqual(keysOf(de).sort());
  });

  it('picks a supported language from preferences', () => {
    expect(pickLanguage(['en-US', 'de'])).toBe('en');
    expect(pickLanguage(['fr-CH', 'de-CH'])).toBe('de');
    expect(pickLanguage(['ja'])).toBe('de');
  });
});
