import { describe, expect, it } from 'vitest';
import { applySelection, computeHunks, countLines } from './hunks';

const original =
  Array.from({ length: 30 }, (_, index) => `line ${String(index + 1)}`).join('\n') + '\n';
const proposed = original
  .replace('line 2\n', 'line two\n')
  .replace('line 25\n', 'line twenty-five\n');

describe('hunks', () => {
  it('finds separate hunks and counts lines', () => {
    const hunks = computeHunks(original, proposed);
    expect(hunks).toHaveLength(2);
    expect(countLines(hunks)).toEqual({ additions: 2, deletions: 2 });
  });

  it('keeps all, none, or only selected hunks', () => {
    expect(applySelection(original, proposed, 'all')).toBe(proposed);
    expect(applySelection(original, proposed, 'none')).toBe(original);
    const firstOnly = applySelection(original, proposed, [0]);
    expect(firstOnly).toContain('line two');
    expect(firstOnly).toContain('line 25');
    const secondOnly = applySelection(original, proposed, [1]);
    expect(secondOnly).toContain('line 2\n');
    expect(secondOnly).toContain('line twenty-five');
  });

  it('handles added and deleted files', () => {
    expect(computeHunks(null, 'new\n')).toHaveLength(1);
    expect(applySelection(null, 'new\n', [0])).toBe('new\n');
    expect(applySelection(null, 'new\n', [])).toBeNull();
    expect(applySelection('gone\n', null, 'none')).toBe('gone\n');
  });
});
