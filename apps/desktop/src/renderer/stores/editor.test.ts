import { describe, expect, it } from 'vitest';
import { neighbourAfterClose, renamedPath } from './editor';
import type { OpenFile } from './editor';

const file = (path: string): OpenFile => ({
  path,
  kind: 'text',
  dirty: false,
  mtimeMs: 0,
  external: 'none',
});

describe('neighbourAfterClose', () => {
  const files = [file('a'), file('b'), file('c')];

  it('prefers the tab to the right', () => {
    expect(neighbourAfterClose(files, 'b')).toBe('c');
  });

  it('falls back to the left at the end', () => {
    expect(neighbourAfterClose(files, 'c')).toBe('b');
    expect(neighbourAfterClose([file('a')], 'a')).toBeNull();
  });
});

describe('renamedPath', () => {
  it('maps the entry itself and its children', () => {
    expect(renamedPath('src/a.ts', 'src/a.ts', 'src/b.ts')).toBe('src/b.ts');
    expect(renamedPath('src/util/x.ts', 'src/util', 'lib/util')).toBe('lib/util/x.ts');
  });

  it('ignores unrelated paths and prefix look-alikes', () => {
    expect(renamedPath('src/utils/x.ts', 'src/util', 'lib/util')).toBeNull();
  });
});
