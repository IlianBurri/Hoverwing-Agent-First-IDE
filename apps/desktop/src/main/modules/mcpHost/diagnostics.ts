import type { FileDiagnostics } from '@kestrel/shared';
import { isSensitivePath } from '@kestrel/shared';
import type { CheckPermission, ToolDefinition, ToolResult } from './tools';
import { externalData } from './tools';

const MAX_LINES = 500;

const text = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }] });

/** "src/a.ts:3:7 error Cannot find name 'x'. (ts 2304)" */
export function formatDiagnostics(files: readonly FileDiagnostics[]): string {
  const lines = files.flatMap((file) =>
    file.diagnostics.map((diagnostic) => {
      const { line, character } = diagnostic.range.start;
      const origin = [diagnostic.source, diagnostic.code].filter(Boolean).join(' ');
      return `${file.path}:${String(line + 1)}:${String(character + 1)} ${diagnostic.severity} ${diagnostic.message.replace(/\s+/g, ' ')}${origin ? ` (${origin})` : ''}`;
    }),
  );
  if (lines.length === 0) return '(no problems)';
  return lines.length > MAX_LINES
    ? [...lines.slice(0, MAX_LINES), `… and ${String(lines.length - MAX_LINES)} more`].join('\n')
    : lines.join('\n');
}

/**
 * The language servers' current errors and warnings in the agent's window
 * (only files the user has open in the editor are analysed). Reading them
 * is a `file.read` of the file (or of "**" for all files).
 */
export function diagnosticsTools(
  diagnostics: () => FileDiagnostics[],
  check: CheckPermission,
): ToolDefinition[] {
  return [
    {
      name: 'get_diagnostics',
      description:
        'Returns the current errors and warnings that language servers report in Hoverwing (for files open in the editor), as "path:line:column severity message". Optionally for one project-relative path.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Project-relative file path, e.g. src/app.ts' },
        },
      },
      run: async (args) => {
        const path = typeof args['path'] === 'string' ? args['path'] : undefined;
        const target = path ?? '**';
        const title = path ? `Diagnostics of ${path}` : 'Diagnostics of all open files';
        if (!(await check('file.read', target, title))) {
          return { ...text('The user did not allow this.'), isError: true };
        }
        const files = diagnostics().filter(
          (file) => !isSensitivePath(file.path) && (path === undefined || file.path === path),
        );
        return text(
          externalData({ source: 'kestrel-lsp' }, 'language servers', formatDiagnostics(files)),
        );
      },
    },
  ];
}
