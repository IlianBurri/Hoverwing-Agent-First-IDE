import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '@kestrel/shared';
import {
  countProblems,
  replaceDiagnostics,
  setDiagnostics,
  sortedProblems,
  useLspStore,
} from './lsp';

const problem = (severity: Diagnostic['severity'], line: number): Diagnostic => ({
  range: { start: { line, character: 0 }, end: { line, character: 1 } },
  severity,
  message: `${severity} ${String(line)}`,
  source: null,
  code: null,
});

describe('lsp store', () => {
  it('keeps only files with problems and counts errors and warnings', () => {
    replaceDiagnostics([]);
    setDiagnostics({ path: 'b.ts', diagnostics: [problem('warning', 1), problem('hint', 2)] });
    setDiagnostics({ path: 'a.ts', diagnostics: [problem('error', 3)] });
    setDiagnostics({ path: 'c.ts', diagnostics: [] });
    const { diagnostics } = useLspStore.getState();
    expect([...diagnostics.keys()]).toEqual(['b.ts', 'a.ts']);
    expect(countProblems(diagnostics)).toEqual({ errors: 1, warnings: 1 });

    setDiagnostics({ path: 'a.ts', diagnostics: [] });
    expect(countProblems(useLspStore.getState().diagnostics)).toEqual({ errors: 0, warnings: 1 });
  });

  it('sorts files by path and problems by severity, then line', () => {
    const sorted = sortedProblems(
      new Map([
        ['z.ts', [problem('info', 0)]],
        ['a.ts', [problem('warning', 1), problem('error', 9), problem('error', 2)]],
      ]),
    );
    expect(sorted.map((file) => file.path)).toEqual(['a.ts', 'z.ts']);
    expect(sorted[0]?.diagnostics.map((d) => d.message)).toEqual([
      'error 2',
      'error 9',
      'warning 1',
    ]);
  });
});
