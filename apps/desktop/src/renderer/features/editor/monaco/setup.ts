/**
 * Loads Monaco from the local bundle (no CDN; the CSP forbids remote code)
 * and wires up its web workers and our themes. Imported lazily, so Monaco's
 * few megabytes do not slow down app start.
 */
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import { toHexColor } from './colors';
import { inlineCompletionProvider } from './inlineCompletion';
import { installLsp } from './lsp';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    switch (label) {
      case 'json':
        return new JsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new CssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new HtmlWorker();
      case 'typescript':
      case 'javascript':
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

// Monaco's own TypeScript service has no project context (no tsconfig, no
// node_modules types), so semantic errors like "cannot find module" would be
// noise. Syntax errors are still shown; while tsserver runs (LSP), Monaco's
// service is switched off and the real diagnostics come from there.
for (const defaults of [
  monaco.typescript.typescriptDefaults,
  monaco.typescript.javascriptDefaults,
]) {
  defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
}

// Ghost text from the user's autocompletion model, for every language.
monaco.languages.registerInlineCompletionsProvider('*', inlineCompletionProvider);

// Language servers (completion, hover, definition, diagnostics).
installLsp(monaco);

export const THEME_DARK = 'kestrel-dark';
export const THEME_LIGHT = 'kestrel-light';

function token(name: string): string | undefined {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return toHexColor(value) ?? undefined;
}

/** Builds a Monaco theme from the design tokens of the current <html> theme. */
function defineTheme(name: string, base: 'vs' | 'vs-dark'): void {
  const colors: Record<string, string | undefined> = {
    'editor.background': token('--bg'),
    'editor.foreground': token('--text'),
    'editorLineNumber.foreground': token('--text-muted'),
    'editorLineNumber.activeForeground': token('--text'),
    'editor.lineHighlightBackground': token('--surface'),
    'editor.selectionBackground': token('--accent-subtle'),
    'editorCursor.foreground': token('--accent'),
    'editorWidget.background': token('--surface-raised'),
    'editorWidget.border': token('--border-strong'),
    'input.background': token('--bg'),
    'input.border': token('--border-strong'),
    focusBorder: token('--accent'),
    'scrollbarSlider.background': token('--border'),
  };
  monaco.editor.defineTheme(name, {
    base,
    inherit: true,
    rules: [],
    colors: Object.fromEntries(
      Object.entries(colors).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  });
}

/** (Re)defines both themes and applies the one matching <html data-theme>. */
export function applyMonacoTheme(): void {
  const dark = document.documentElement.dataset['theme'] !== 'light';
  defineTheme(dark ? THEME_DARK : THEME_LIGHT, dark ? 'vs-dark' : 'vs');
  monaco.editor.setTheme(dark ? THEME_DARK : THEME_LIGHT);
}

// Follow theme switches of the app.
new MutationObserver(applyMonacoTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});

// Monaco measures character widths once; redo it when our font has loaded.
void document.fonts.ready.then(() => {
  monaco.editor.remeasureFonts();
});

export { monaco };
