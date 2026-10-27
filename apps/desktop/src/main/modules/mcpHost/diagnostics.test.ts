import { describe, expect, it, vi } from 'vitest';
import type { Diagnostic, FileDiagnostics } from '@kestrel/shared';
import { diagnosticsTools, formatDiagnostics } from './diagnostics';

const problem = (message: string, extra: Partial<Diagnostic> = {}): Diagnostic => ({
  range: { start: { line: 2, character: 6 }, end: { line: 2, character: 7 } },
  severity: 'error',
  message,
  source: 'ts',
  code: '2304',
  ...extra,
});

const files: FileDiagnostics[] = [
  { path: 'src/a.ts', diagnostics: [problem("Cannot find name 'x'.")] },
  { path: 'b.py', diagnostics: [problem('multi\n  line', { severity: 'warning', code: null })] },
  { path: '.env', diagnostics: [problem('SECRET=1')] },
];

const tool = (check = vi.fn(() => Promise.resolve(true))) => {
  const [found] = diagnosticsTools(() => files, check);
  if (!found) throw new Error('missing tool');
  return { found, check };
};

const textOf = (result: Awaited<ReturnType<ReturnType<typeof tool>['found']['run']>>) =>
  result.content[0]?.type === 'text' ? result.content[0].text : '';

describe('get_diagnostics', () => {
  it('formats one line per problem', () => {
    expect(formatDiagnostics(files.slice(0, 2))).toBe(
      "src/a.ts:3:7 error Cannot find name 'x'. (ts 2304)\nb.py:3:7 warning multi line (ts)",
    );
    expect(formatDiagnostics([])).toBe('(no problems)');
  });

  it('asks for file.read, leaves out secret files and marks the result as data', async () => {
    const { found, check } = tool();
    const all = textOf(await found.run({}));
    expect(check).toHaveBeenCalledWith('file.read', '**', 'Diagnostics of all open files');
    expect(all).toContain('<external-data source="kestrel-lsp">');
    expect(all).toContain('src/a.ts:3:7');
    expect(all).not.toContain('SECRET');

    const one = textOf(await found.run({ path: 'b.py' }));
    expect(check).toHaveBeenLastCalledWith('file.read', 'b.py', 'Diagnostics of b.py');
    expect(one).toContain('b.py:3:7');
    expect(one).not.toContain('src/a.ts');
  });

  it('returns an error when the user declines', async () => {
    const { found } = tool(vi.fn(() => Promise.resolve(false)));
    const result = await found.run({});
    expect(result.isError).toBe(true);
  });
});
