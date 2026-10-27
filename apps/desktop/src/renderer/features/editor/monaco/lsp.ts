import type * as Monaco from 'monaco-editor';
import type { CancellationToken, editor, IDisposable, languages } from 'monaco-editor';
import type {
  CompletionItem,
  Diagnostic,
  IpcResult,
  LspPosition,
  LspRange,
  SignatureHelp,
} from '@kestrel/shared';
import { useLspStore } from '../../../stores/lsp';
import { openFile } from '../actions';

type MonacoApi = typeof Monaco;

/** Changes are sent after this pause (and right before every request). */
const CHANGE_DEBOUNCE_MS = 150;
const MARKER_OWNER = 'kestrel-lsp';

let nextRequestId = 0;

/** Project-relative path of an editor model (our models use the kestrel: scheme). */
export function pathOf(model: editor.ITextModel): string | null {
  return model.uri.scheme === 'kestrel' ? model.uri.path.replace(/^\//, '') : null;
}

interface Synced {
  model: editor.ITextModel;
  /** A change is waiting for the debounce. */
  timer: number | null;
  listener: IDisposable;
}

/** Documents a language server handles (lsp:open answered `served`). */
const synced = new Map<string, Synced>();

function sendChange(path: string): Promise<unknown> {
  const entry = synced.get(path);
  if (!entry || entry.timer === null) return Promise.resolve();
  window.clearTimeout(entry.timer);
  entry.timer = null;
  return window.kestrel.invoke('lsp:change', {
    path,
    text: entry.model.getValue(),
    version: entry.model.getVersionId(),
  });
}

async function track(model: editor.ITextModel): Promise<void> {
  const path = pathOf(model);
  if (path === null) return;
  const result = await window.kestrel.invoke('lsp:open', {
    path,
    text: model.getValue(),
    version: model.getVersionId(),
  });
  if (!result.ok || !result.data.served || model.isDisposed()) return;
  const entry: Synced = {
    model,
    timer: null,
    listener: model.onDidChangeContent(() => {
      if (entry.timer !== null) window.clearTimeout(entry.timer);
      entry.timer = window.setTimeout(() => {
        void sendChange(path);
      }, CHANGE_DEBOUNCE_MS);
    }),
  };
  // Mark as pending so a change between open and now is sent.
  if (model.getVersionId() !== 1) entry.timer = window.setTimeout(() => void sendChange(path), 0);
  synced.set(path, entry);
}

function untrack(model: editor.ITextModel): void {
  const path = pathOf(model);
  if (path === null) return;
  const entry = synced.get(path);
  if (entry?.model !== model) return;
  entry.listener.dispose();
  if (entry.timer !== null) window.clearTimeout(entry.timer);
  synced.delete(path);
  void window.kestrel.invoke('lsp:close', { path });
}

const toLsp = (position: Monaco.Position): LspPosition => ({
  line: position.lineNumber - 1,
  character: position.column - 1,
});

const toRange = (range: LspRange): Monaco.IRange => ({
  startLineNumber: range.start.line + 1,
  startColumn: range.start.character + 1,
  endLineNumber: range.end.line + 1,
  endColumn: range.end.character + 1,
});

/**
 * Runs a request for a served document: pending changes go first, and a
 * cancelled Monaco token cancels the request in main (and at the server).
 */
async function ask<T>(
  model: editor.ITextModel,
  token: CancellationToken,
  run: (path: string, requestId: string) => Promise<IpcResult<T>>,
): Promise<T | null> {
  const path = pathOf(model);
  if (path === null || !synced.has(path)) return null;
  // A function, so TypeScript does not narrow the flag across awaits.
  const cancelled = () => token.isCancellationRequested;
  await sendChange(path);
  if (cancelled()) return null;
  const requestId = `r${String(++nextRequestId)}`;
  const subscription = token.onCancellationRequested(() => {
    void window.kestrel.invoke('lsp:cancel', { requestId });
  });
  try {
    const result = await run(path, requestId);
    return result.ok && !cancelled() ? result.data : null;
  } finally {
    subscription.dispose();
  }
}

/** LSP CompletionItemKind (1-based) → Monaco's enum member names. */
const completionKinds = [
  'Text',
  'Method',
  'Function',
  'Constructor',
  'Field',
  'Variable',
  'Class',
  'Interface',
  'Module',
  'Property',
  'Unit',
  'Value',
  'Enum',
  'Keyword',
  'Snippet',
  'Color',
  'File',
  'Reference',
  'Folder',
  'EnumMember',
  'Constant',
  'Struct',
  'Event',
  'Operator',
  'TypeParameter',
] as const;

function completionItem(
  monaco: MonacoApi,
  item: CompletionItem,
  fallback: Monaco.IRange,
): languages.CompletionItem {
  const kindName = item.kind === null ? undefined : completionKinds[item.kind - 1];
  return {
    label: item.label,
    kind: monaco.languages.CompletionItemKind[kindName ?? 'Text'],
    insertText: item.insertText,
    range: item.range ? toRange(item.range) : fallback,
    additionalTextEdits: item.additionalEdits.map((edit) => ({
      range: toRange(edit.range),
      text: edit.text,
    })),
    ...(item.detail ? { detail: item.detail } : {}),
    ...(item.documentation ? { documentation: { value: item.documentation } } : {}),
    ...(item.snippet
      ? { insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }
      : {}),
    ...(item.sortText ? { sortText: item.sortText } : {}),
    ...(item.filterText ? { filterText: item.filterText } : {}),
  };
}

function signatureHelp(help: SignatureHelp): languages.SignatureHelp {
  return {
    signatures: help.signatures.map((signature) => ({
      label: signature.label,
      ...(signature.documentation ? { documentation: { value: signature.documentation } } : {}),
      parameters: signature.parameters.map((parameter) => ({
        label: parameter.label,
        ...(parameter.documentation ? { documentation: { value: parameter.documentation } } : {}),
      })),
    })),
    activeSignature: help.activeSignature,
    activeParameter: help.activeParameter,
  };
}

const markerSeverity = (monaco: MonacoApi, severity: Diagnostic['severity']) =>
  ({
    error: monaco.MarkerSeverity.Error,
    warning: monaco.MarkerSeverity.Warning,
    info: monaco.MarkerSeverity.Info,
    hint: monaco.MarkerSeverity.Hint,
  })[severity];

function applyMarkers(monaco: MonacoApi, model: editor.ITextModel): void {
  const path = pathOf(model);
  if (path === null) return;
  const diagnostics = useLspStore.getState().diagnostics.get(path) ?? [];
  monaco.editor.setModelMarkers(
    model,
    MARKER_OWNER,
    diagnostics.map((diagnostic) => ({
      ...toRange(diagnostic.range),
      severity: markerSeverity(monaco, diagnostic.severity),
      message: diagnostic.message,
      ...(diagnostic.source ? { source: diagnostic.source } : {}),
      ...(diagnostic.code ? { code: diagnostic.code } : {}),
    })),
  );
}

let builtinTypeScript = true;

/** Monaco's own TypeScript service would answer twice while tsserver runs. */
function useBuiltinTypeScript(monaco: MonacoApi, enabled: boolean): void {
  // Each call re-registers Monaco's providers, so only act on a change.
  if (enabled === builtinTypeScript) return;
  builtinTypeScript = enabled;
  for (const defaults of [
    monaco.typescript.typescriptDefaults,
    monaco.typescript.javascriptDefaults,
  ]) {
    defaults.setModeConfiguration({
      ...defaults.modeConfiguration,
      completionItems: enabled,
      hovers: enabled,
      definitions: enabled,
      signatureHelp: enabled,
      diagnostics: enabled,
    });
  }
}

/** Wires language servers into Monaco: sync, providers, markers, navigation. */
export function installLsp(monaco: MonacoApi): void {
  monaco.editor.onDidCreateModel((model) => {
    applyMarkers(monaco, model);
    void track(model);
  });
  monaco.editor.onWillDisposeModel(untrack);

  monaco.languages.registerCompletionItemProvider('*', {
    triggerCharacters: ['.', ':', '<', '"', "'", '/', '@', '#'],
    async provideCompletionItems(model, position, context, token) {
      const result = await ask(model, token, (path, requestId) =>
        window.kestrel.invoke('lsp:completion', {
          path,
          position: toLsp(position),
          requestId,
          ...(context.triggerCharacter ? { triggerCharacter: context.triggerCharacter } : {}),
        }),
      );
      if (!result) return { suggestions: [] };
      const word = model.getWordUntilPosition(position);
      const fallback = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };
      return {
        suggestions: result.items.map((item) => completionItem(monaco, item, fallback)),
        incomplete: result.incomplete,
      };
    },
  });

  monaco.languages.registerHoverProvider('*', {
    async provideHover(model, position, token) {
      const result = await ask(model, token, (path, requestId) =>
        window.kestrel.invoke('lsp:hover', { path, position: toLsp(position), requestId }),
      );
      if (!result) return null;
      return {
        contents: [{ value: result.contents }],
        ...(result.range ? { range: toRange(result.range) } : {}),
      };
    },
  });

  monaco.languages.registerDefinitionProvider('*', {
    async provideDefinition(model, position, token) {
      const result = await ask(model, token, (path, requestId) =>
        window.kestrel.invoke('lsp:definition', { path, position: toLsp(position), requestId }),
      );
      return (result ?? []).map((location) => ({
        uri: monaco.Uri.from({ scheme: 'kestrel', path: `/${location.path}` }),
        range: toRange(location.range),
      }));
    },
  });

  monaco.languages.registerSignatureHelpProvider('*', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [')'],
    async provideSignatureHelp(model, position, token, context) {
      const result = await ask(model, token, (path, requestId) =>
        window.kestrel.invoke('lsp:signatureHelp', {
          path,
          position: toLsp(position),
          requestId,
          ...(context.triggerCharacter ? { triggerCharacter: context.triggerCharacter } : {}),
        }),
      );
      return result ? { value: signatureHelp(result), dispose: () => undefined } : null;
    },
  });

  // "Go to definition" in another file: open it as a tab at the position.
  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource, selectionOrPosition) {
      if (resource.scheme !== 'kestrel') return false;
      const path = resource.path.replace(/^\//, '');
      const start =
        selectionOrPosition && 'startLineNumber' in selectionOrPosition
          ? { line: selectionOrPosition.startLineNumber, column: selectionOrPosition.startColumn }
          : selectionOrPosition
            ? { line: selectionOrPosition.lineNumber, column: selectionOrPosition.column }
            : { line: 1, column: 1 };
      const length =
        selectionOrPosition &&
        'startLineNumber' in selectionOrPosition &&
        selectionOrPosition.endLineNumber === selectionOrPosition.startLineNumber
          ? selectionOrPosition.endColumn - selectionOrPosition.startColumn
          : 0;
      void openFile(path, { line: start.line, column: start.column - 1, length });
      return true;
    },
  });

  // Diagnostics → markers of open models.
  useLspStore.subscribe((state, previous) => {
    if (state.diagnostics !== previous.diagnostics) {
      for (const model of monaco.editor.getModels()) {
        const path = pathOf(model);
        if (path !== null && state.diagnostics.get(path) !== previous.diagnostics.get(path)) {
          applyMarkers(monaco, model);
        }
      }
    }
    if (state.statuses !== previous.statuses) {
      const tsReady = state.statuses.some(
        (status) => status.serverId === 'typescript' && status.state === 'ready',
      );
      useBuiltinTypeScript(monaco, !tsReady);
    }
  });
}
