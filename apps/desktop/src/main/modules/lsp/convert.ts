import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  CompletionItem,
  CompletionList,
  Diagnostic,
  FileDiagnostics,
  Hover,
  Location,
  LspRange,
  SignatureHelp,
} from '@kestrel/shared';
import type * as Lsp from 'vscode-languageserver-protocol';

/** Completion lists can be huge (all globals); more is never useful in the UI. */
export const MAX_COMPLETION_ITEMS = 2000;
const MAX_TEXT = 50_000;

export function toUri(root: string, path: string): string {
  return pathToFileURL(join(root, ...path.split('/'))).href;
}

/** Project-relative path for a file URI, or null outside the project. */
export function toRelative(root: string, uri: string): string | null {
  if (!uri.startsWith('file:')) return null;
  let absolute: string;
  try {
    absolute = fileURLToPath(uri);
  } catch {
    return null;
  }
  const path = relative(root, absolute);
  if (path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) return null;
  return path.split(sep).join('/');
}

function clip(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)} …` : text;
}

function range(value: Lsp.Range): LspRange {
  return {
    start: { line: value.start.line, character: value.start.character },
    end: { line: value.end.line, character: value.end.character },
  };
}

/** LSP's deprecated `MarkedString`, which servers still send in hovers. */
type MarkedString = string | { language: string; value: string };

/** Markdown for the many shapes LSP uses for documentation. */
export function markdown(
  value: Lsp.MarkupContent | MarkedString | MarkedString[] | undefined | null,
): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const parts = value.map((part) => markdown(part)).filter((part) => part);
    return parts.length > 0 ? parts.join('\n\n') : null;
  }
  if (typeof value === 'string') return value ? clip(value) : null;
  if ('kind' in value) {
    if (!value.value) return null;
    return clip(value.kind === 'markdown' ? value.value : escapeMarkdown(value.value));
  }
  return value.value ? clip(`\`\`\`${value.language}\n${value.value}\n\`\`\``) : null;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!<>|]/g, '\\$&');
}

const severities = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' } as const;

export function diagnostics(
  root: string,
  params: Lsp.PublishDiagnosticsParams,
): FileDiagnostics | null {
  const path = toRelative(root, params.uri);
  if (path === null) return null;
  return {
    path,
    diagnostics: params.diagnostics.slice(0, 1000).map((item): Diagnostic => ({
      range: range(item.range),
      severity: severities[item.severity ?? 1],
      message: typeof item.message === 'string' ? clip(item.message) : clip(item.message.value),
      source: item.source ?? null,
      code: item.code === undefined ? null : String(item.code),
    })),
  };
}

function editRange(edit: Lsp.Range | { insert: Lsp.Range; replace: Lsp.Range }): Lsp.Range {
  return 'insert' in edit ? edit.replace : edit;
}

export function completion(
  result: Lsp.CompletionItem[] | Lsp.CompletionList | null | undefined,
): CompletionList {
  if (!result) return { items: [], incomplete: false };
  const list = Array.isArray(result) ? { items: result, isIncomplete: false } : result;
  const defaults = Array.isArray(result) ? undefined : result.itemDefaults;
  const items = list.items.slice(0, MAX_COMPLETION_ITEMS).map((item): CompletionItem => {
    const textEdit = item.textEdit;
    const defaultRange = defaults?.editRange;
    const replace = textEdit
      ? editRange('range' in textEdit ? textEdit.range : textEdit)
      : defaultRange
        ? editRange(defaultRange)
        : null;
    const format = item.insertTextFormat ?? defaults?.insertTextFormat;
    return {
      label: item.label,
      kind: item.kind ?? null,
      detail: item.detail ?? item.labelDetails?.description ?? null,
      documentation: markdown(item.documentation),
      insertText: textEdit?.newText ?? item.insertText ?? item.label,
      snippet: format === 2,
      range: replace ? range(replace) : null,
      sortText: item.sortText ?? null,
      filterText: item.filterText ?? null,
      additionalEdits: (item.additionalTextEdits ?? []).map((edit) => ({
        range: range(edit.range),
        text: edit.newText,
      })),
    };
  });
  return {
    items,
    incomplete: list.isIncomplete || list.items.length > MAX_COMPLETION_ITEMS,
  };
}

export function hover(result: Lsp.Hover | null | undefined): Hover | null {
  const contents = markdown(result?.contents);
  if (!result || !contents) return null;
  return { contents, range: result.range ? range(result.range) : null };
}

export function locations(
  root: string,
  result: Lsp.Location | Lsp.Location[] | Lsp.LocationLink[] | null | undefined,
): Location[] {
  if (!result) return [];
  const all = Array.isArray(result) ? result : [result];
  const found: Location[] = [];
  for (const entry of all) {
    const uri = 'targetUri' in entry ? entry.targetUri : entry.uri;
    const target = 'targetUri' in entry ? entry.targetSelectionRange : entry.range;
    const path = toRelative(root, uri);
    if (path !== null) found.push({ path, range: range(target) });
  }
  return found;
}

export function signatureHelp(result: Lsp.SignatureHelp | null | undefined): SignatureHelp | null {
  if (!result || result.signatures.length === 0) return null;
  const activeSignature = Math.min(result.activeSignature ?? 0, result.signatures.length - 1);
  const active = result.signatures[activeSignature];
  return {
    signatures: result.signatures.map((signature) => ({
      label: signature.label,
      documentation: markdown(signature.documentation),
      parameters: (signature.parameters ?? []).map((parameter) => ({
        label:
          typeof parameter.label === 'string'
            ? parameter.label
            : ([parameter.label[0], parameter.label[1]] as [number, number]),
        documentation: markdown(parameter.documentation),
      })),
    })),
    activeSignature,
    activeParameter: active?.activeParameter ?? result.activeParameter ?? 0,
  };
}
