import { describe, expect, it } from 'vitest';
import { MAX_TOOLBAR_ITEMS } from '@kestrel/shared';
import { addItem, moveItem, removeItem } from './items';

describe('toolbar items', () => {
  it('adds without duplicates and up to the limit', () => {
    expect(addItem(['a'], 'b')).toEqual(['a', 'b']);
    expect(addItem(['a'], 'a')).toEqual(['a']);
    const full = Array.from({ length: MAX_TOOLBAR_ITEMS }, (_, i) => `c${String(i)}`);
    expect(addItem(full, 'x')).toEqual(full);
  });

  it('removes and moves items, staying put at the ends', () => {
    expect(removeItem(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 'b', 1)).toEqual(['a', 'b']);
    expect(moveItem(['a'], 'missing', 1)).toEqual(['a']);
  });
});
