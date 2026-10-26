import type { CancellationToken, editor, languages, Position } from 'monaco-editor';
import { COMPLETION_PREFIX_CHARS, COMPLETION_SUFFIX_CHARS } from '@kestrel/shared';
import { useProvidersStore } from '../../../stores/providers';
import { useSettingsStore } from '../../../stores/settings';

/** Pause after typing before a suggestion is requested. */
export const COMPLETION_DEBOUNCE_MS = 250;

let nextRequestId = 0;

/** Project-relative path of a model (our models use the kestrel: scheme). */
function pathOf(model: editor.ITextModel): string | null {
  return model.uri.scheme === 'kestrel' ? model.uri.path.replace(/^\//, '') : null;
}

function wait(ms: number, token: CancellationToken): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      listener.dispose();
      resolve(true);
    }, ms);
    const listener = token.onCancellationRequested(() => {
      window.clearTimeout(timer);
      listener.dispose();
      resolve(false);
    });
  });
}

/**
 * Ghost-text suggestions from the user's autocompletion model. Monaco
 * cancels the token on every keystroke; we wait for a pause, then ask main,
 * and cancel the request there too. Typing is never blocked.
 */
export const inlineCompletionProvider: languages.InlineCompletionsProvider = {
  async provideInlineCompletions(
    model: editor.ITextModel,
    position: Position,
    _context: languages.InlineCompletionContext,
    token: CancellationToken,
  ): Promise<languages.InlineCompletions> {
    const empty = { items: [] };
    const settings = useSettingsStore.getState().settings.completion;
    const path = pathOf(model);
    if (!settings.enabled || !settings.model || path === null) return empty;
    if (settings.disabledLanguages.includes(model.getLanguageId())) return empty;
    if (!(await wait(COMPLETION_DEBOUNCE_MS, token))) return empty;

    // Only the text around the cursor, not the whole file.
    const offset = model.getOffsetAt(position);
    const range = (from: number, to: number) => {
      const start = model.getPositionAt(from);
      const end = model.getPositionAt(to);
      return model.getValueInRange({
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      });
    };
    const prefix = range(Math.max(0, offset - COMPLETION_PREFIX_CHARS), offset);
    const suffix = range(offset, offset + COMPLETION_SUFFIX_CHARS);
    if (prefix.trim() === '') return empty;

    const requestId = ++nextRequestId;
    const listener = token.onCancellationRequested(() => {
      void window.kestrel.invoke('completion:cancel', { requestId });
    });
    try {
      const result = await window.kestrel.invoke('completion:request', {
        requestId,
        path,
        language: model.getLanguageId(),
        prefix,
        suffix,
      });
      if (!result.ok || token.isCancellationRequested) return empty;
      useProvidersStore.setState({ completionError: result.data.error });
      if (!result.data.text) return empty;
      return {
        items: [
          {
            insertText: result.data.text,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
          },
        ],
      };
    } finally {
      listener.dispose();
    }
  },
  disposeInlineCompletions: () => undefined,
};
