import { describe, expect, it } from 'vitest';
import { toHexColor } from './colors';

describe('toHexColor', () => {
  it('passes hex colors through', () => {
    expect(toHexColor('#0F1115')).toBe('#0f1115');
    expect(toHexColor('#abc')).toBe('#aabbcc');
  });

  it('converts rgb with alpha', () => {
    expect(toHexColor('rgb(124 156 255 / 0.14)')).toBe('#7c9cff24');
    expect(toHexColor('rgba(0, 0, 0, 50%)')).toBe('#00000080');
  });

  it('returns null for unknown formats', () => {
    expect(toHexColor('var(--x)')).toBeNull();
  });
});
