import { useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import { applyMonacoTheme, monaco } from '../editor/monaco/setup';
import styles from './ReviewView.module.css';

interface DiffHostProps {
  path: string;
  original: string;
  proposed: string;
  /** 1-based line in the proposed version to scroll to. */
  revealLine: number | null;
}

/** Read-only Monaco diff view: before (left) and after (right). */
export default function DiffHost({ path, original, proposed, revealLine }: DiffHostProps) {
  const container = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    if (!container.current) return;
    applyMonacoTheme();
    const diffEditor = monaco.editor.createDiffEditor(container.current, {
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: true,
      minimap: { enabled: false },
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono'),
      fontSize: 13,
      scrollBeyondLastLine: false,
    });
    editorRef.current = diffEditor;
    return () => {
      const model = diffEditor.getModel();
      diffEditor.dispose();
      model?.original.dispose();
      model?.modified.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const diffEditor = editorRef.current;
    if (!diffEditor) return;
    const stamp = Date.now();
    // The extension in the URI lets Monaco pick the language.
    const before = monaco.editor.createModel(
      original,
      undefined,
      monaco.Uri.from({ scheme: 'kestrel-review-before', path: `/${String(stamp)}/${path}` }),
    );
    const after = monaco.editor.createModel(
      proposed,
      undefined,
      monaco.Uri.from({ scheme: 'kestrel-review-after', path: `/${String(stamp)}/${path}` }),
    );
    const previous = diffEditor.getModel();
    diffEditor.setModel({ original: before, modified: after });
    previous?.original.dispose();
    previous?.modified.dispose();
  }, [path, original, proposed]);

  useEffect(() => {
    if (revealLine !== null) editorRef.current?.getModifiedEditor().revealLineInCenter(revealLine);
  }, [revealLine]);

  return <div ref={container} className={styles['diff']} data-testid="review-diff" />;
}
