import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as convert from './convert';

const root = join('/', 'projects', 'demo');
const uri = (path: string) => pathToFileURL(join(root, path)).href;
const range = (line: number, start: number, end: number) => ({
  start: { line, character: start },
  end: { line, character: end },
});

describe('LSP conversions', () => {
  it('maps file URIs to project-relative paths and drops everything outside', () => {
    expect(convert.toRelative(root, uri('src/a b.ts'))).toBe('src/a b.ts');
    expect(convert.toRelative(root, convert.toUri(root, 'src/x.ts'))).toBe('src/x.ts');
    expect(convert.toRelative(root, pathToFileURL(join(root, '..', 'other.ts')).href)).toBeNull();
    expect(convert.toRelative(root, pathToFileURL(root).href)).toBeNull();
    expect(convert.toRelative(root, 'untitled:Untitled-1')).toBeNull();
  });

  it('turns the different documentation shapes into markdown', () => {
    expect(convert.markdown({ kind: 'markdown', value: '**bold**' })).toBe('**bold**');
    expect(convert.markdown({ kind: 'plaintext', value: 'a*b' })).toBe('a\\*b');
    expect(convert.markdown({ language: 'ts', value: 'let x' })).toBe('```ts\nlet x\n```');
    expect(convert.markdown(['one', { language: 'ts', value: 'two' }])).toBe(
      'one\n\n```ts\ntwo\n```',
    );
    expect(convert.markdown('')).toBeNull();
    expect(convert.markdown(undefined)).toBeNull();
  });

  it('converts completion items incl. text edits, defaults and auto-imports', () => {
    const list = convert.completion({
      isIncomplete: false,
      itemDefaults: { editRange: range(0, 0, 2), insertTextFormat: 2 },
      items: [
        { label: 'a', insertText: 'a($1)' },
        {
          label: 'b',
          kind: 3,
          textEdit: { insert: range(1, 0, 1), replace: range(1, 0, 4), newText: 'bb' },
          insertTextFormat: 1,
          additionalTextEdits: [{ range: range(0, 0, 0), newText: 'import b;\n' }],
        },
      ],
    });
    expect(list.incomplete).toBe(false);
    expect(list.items[0]).toMatchObject({
      insertText: 'a($1)',
      snippet: true,
      range: range(0, 0, 2),
    });
    expect(list.items[1]).toMatchObject({
      insertText: 'bb',
      kind: 3,
      snippet: false,
      range: range(1, 0, 4),
      additionalEdits: [{ range: range(0, 0, 0), text: 'import b;\n' }],
    });
    expect(convert.completion(null)).toEqual({ items: [], incomplete: false });
  });

  it('caps huge completion lists and marks them incomplete', () => {
    const items = Array.from({ length: convert.MAX_COMPLETION_ITEMS + 5 }, (_, i) => ({
      label: `x${String(i)}`,
    }));
    const list = convert.completion(items);
    expect(list.items).toHaveLength(convert.MAX_COMPLETION_ITEMS);
    expect(list.incomplete).toBe(true);
  });

  it('keeps only definitions inside the project', () => {
    expect(
      convert.locations(root, [
        { uri: uri('src/a.ts'), range: range(3, 1, 4) },
        { uri: 'file:///elsewhere/lib.d.ts', range: range(0, 0, 1) },
      ]),
    ).toEqual([{ path: 'src/a.ts', range: range(3, 1, 4) }]);
    expect(
      convert.locations(root, [
        {
          targetUri: uri('b.ts'),
          targetRange: range(0, 0, 9),
          targetSelectionRange: range(0, 6, 7),
        },
      ]),
    ).toEqual([{ path: 'b.ts', range: range(0, 6, 7) }]);
    expect(convert.locations(root, null)).toEqual([]);
  });

  it('maps diagnostics with severities and codes', () => {
    expect(
      convert.diagnostics(root, {
        uri: uri('a.ts'),
        diagnostics: [
          { range: range(0, 0, 1), message: 'bad', severity: 2, code: 2304, source: 'ts' },
          { range: range(1, 0, 1), message: 'worse' },
        ],
      }),
    ).toEqual({
      path: 'a.ts',
      diagnostics: [
        { range: range(0, 0, 1), message: 'bad', severity: 'warning', code: '2304', source: 'ts' },
        { range: range(1, 0, 1), message: 'worse', severity: 'error', code: null, source: null },
      ],
    });
  });

  it('converts signature help and hover', () => {
    expect(
      convert.signatureHelp({
        signatures: [{ label: 'f(a, b)', parameters: [{ label: [2, 3] }, { label: 'b' }] }],
        activeSignature: 5,
        activeParameter: 1,
      }),
    ).toEqual({
      signatures: [
        {
          label: 'f(a, b)',
          documentation: null,
          parameters: [
            { label: [2, 3], documentation: null },
            { label: 'b', documentation: null },
          ],
        },
      ],
      activeSignature: 0,
      activeParameter: 1,
    });
    expect(convert.signatureHelp({ signatures: [] })).toBeNull();
    expect(convert.hover({ contents: { kind: 'markdown', value: '' } })).toBeNull();
    expect(convert.hover({ contents: 'hi', range: range(0, 0, 2) })).toEqual({
      contents: 'hi',
      range: range(0, 0, 2),
    });
  });
});
