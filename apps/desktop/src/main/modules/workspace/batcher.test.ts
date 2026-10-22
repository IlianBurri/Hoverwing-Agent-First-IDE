import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeBatcher } from './batcher';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ChangeBatcher', () => {
  it('delivers changes in one batch after the delay', () => {
    const deliver = vi.fn();
    const batcher = new ChangeBatcher(deliver, 100);
    batcher.push([{ type: 'create', path: 'a.ts' }]);
    batcher.push([{ type: 'update', path: 'b.ts' }]);
    expect(deliver).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledWith({
      changes: [
        { type: 'create', path: 'a.ts' },
        { type: 'update', path: 'b.ts' },
      ],
      overflow: false,
    });
  });

  it('keeps only the latest change per path', () => {
    const deliver = vi.fn();
    const batcher = new ChangeBatcher(deliver, 100);
    batcher.push([
      { type: 'create', path: 'a.ts' },
      { type: 'delete', path: 'a.ts' },
    ]);
    batcher.flush();
    expect(deliver).toHaveBeenCalledWith({
      changes: [{ type: 'delete', path: 'a.ts' }],
      overflow: false,
    });
  });

  it('collapses floods into an overflow signal', () => {
    const deliver = vi.fn();
    const batcher = new ChangeBatcher(deliver, 100, 3);
    batcher.push(
      Array.from({ length: 10 }, (_, index) => ({ type: 'create' as const, path: `${index}` })),
    );
    vi.advanceTimersByTime(100);
    expect(deliver).toHaveBeenCalledWith({ changes: [], overflow: true });
  });

  it('delivers nothing after dispose', () => {
    const deliver = vi.fn();
    const batcher = new ChangeBatcher(deliver, 100);
    batcher.push([{ type: 'create', path: 'a.ts' }]);
    batcher.dispose();
    vi.advanceTimersByTime(200);
    expect(deliver).not.toHaveBeenCalled();
  });
});
