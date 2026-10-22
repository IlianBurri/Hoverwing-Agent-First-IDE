import { describe, expect, it } from 'vitest';
import { usableLayout } from './layout';

describe('usableLayout', () => {
  const ids = ['sidebar', 'center', 'agent'];

  it('accepts a layout that matches the panels', () => {
    const layout = { sidebar: 20, center: 55, agent: 25 };
    expect(usableLayout(layout, ids)).toBe(layout);
  });

  it('rejects layouts for other panels', () => {
    expect(usableLayout({ sidebar: 20, center: 80 }, ids)).toBeUndefined();
    expect(usableLayout({ sidebar: 20, center: 55, chat: 25 }, ids)).toBeUndefined();
  });

  it('rejects layouts that do not add up to 100%', () => {
    expect(usableLayout({ sidebar: 20, center: 20, agent: 20 }, ids)).toBeUndefined();
  });

  it('handles missing layouts', () => {
    expect(usableLayout(undefined, ids)).toBeUndefined();
  });
});
