import { useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import { useEditorStore } from '../../stores/editor';
import { getModel, getViewState, saveViewState } from './monaco/models';
import { applyMonacoTheme, monaco } from './monaco/setup';
import { setSnapshotSource } from './snapshot';
import styles from './MonacoHost.module.css';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One Monaco editor instance for all tabs. Switching tabs swaps the model
 * and restores scroll/cursor (view state), like VS Code does.
 */
export default function MonacoHost({ path }: { path: string }) {
  const container = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const shownPath = useRef<string | null>(null);
  const pendingReveal = useEditorStore((state) => state.pendingReveal);

  useEffect(() => {
    if (!container.current) return;
    applyMonacoTheme();
    const instance = monaco.editor.create(container.current, {
      model: null,
      automaticLayout: true,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono'),
      fontSize: 13,
      lineHeight: 20,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
      smoothScrolling: !reducedMotion,
      cursorBlinking: reducedMotion ? 'solid' : 'smooth',
      fixedOverflowWidgets: true,
      padding: { top: 8 },
      accessibilitySupport: 'auto',
      // Ghost text from the autocompletion model (if switched on).
      inlineSuggest: { enabled: true },
    });
    editorRef.current = instance;

    const reportCursor = () => {
      const model = instance.getModel();
      const position = instance.getPosition();
      if (!model || !position) return;
      useEditorStore.setState({
        cursor: {
          line: position.lineNumber,
          column: position.column,
          language: model.getLanguageId(),
          eol: model.getEOL() === '\r\n' ? 'CRLF' : 'LF',
        },
      });
    };
    const cursorListener = instance.onDidChangeCursorPosition(reportCursor);
    const modelListener = instance.onDidChangeModel(reportCursor);
    setSnapshotSource(() => {
      const model = instance.getModel();
      const path = shownPath.current;
      if (!model || !path) return null;
      const selection = instance.getSelection();
      const language = model.getLanguageId();
      if (!selection || selection.isEmpty()) {
        return { path, language, text: model.getValue(), lines: null };
      }
      return {
        path,
        language,
        text: model.getValueInRange(selection),
        lines: { start: selection.startLineNumber, end: selection.endLineNumber },
      };
    });

    return () => {
      setSnapshotSource(null);
      if (shownPath.current) saveViewState(shownPath.current, instance.saveViewState());
      cursorListener.dispose();
      modelListener.dispose();
      instance.dispose();
      editorRef.current = null;
      shownPath.current = null;
      useEditorStore.setState({ cursor: null });
    };
  }, []);

  // Swap the model when the active tab changes.
  useEffect(() => {
    const instance = editorRef.current;
    if (!instance || shownPath.current === path) return;
    if (shownPath.current) saveViewState(shownPath.current, instance.saveViewState());
    instance.setModel(getModel(path) ?? null);
    const viewState = getViewState(path);
    if (viewState) instance.restoreViewState(viewState);
    shownPath.current = path;
    instance.focus();
  }, [path]);

  // Jump to a position (e.g. from search results).
  useEffect(() => {
    const instance = editorRef.current;
    if (!instance || pendingReveal?.path !== path) return;
    const { line, column, length } = pendingReveal;
    const range = new monaco.Range(line, column + 1, line, column + 1 + length);
    instance.setSelection(range);
    instance.revealRangeInCenterIfOutsideViewport(range);
    instance.focus();
    useEditorStore.setState({ pendingReveal: null });
  }, [pendingReveal, path]);

  return <div ref={container} className={styles['root']} data-testid="monaco-editor" />;
}
