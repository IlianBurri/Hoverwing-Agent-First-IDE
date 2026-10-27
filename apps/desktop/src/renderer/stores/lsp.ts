import { create } from 'zustand';
import type { Diagnostic, FileDiagnostics, LspServerStatus, LspServerView } from '@kestrel/shared';

export interface LogLine {
  line: string;
  time: number;
}

interface LspState {
  /** Diagnostics per project-relative path (only files with problems). */
  diagnostics: ReadonlyMap<string, readonly Diagnostic[]>;
  statuses: readonly LspServerStatus[];
  servers: readonly LspServerView[];
  log: readonly LogLine[];
}

const MAX_LOG_LINES = 500;

export const useLspStore = create<LspState>()(() => ({
  diagnostics: new Map(),
  statuses: [],
  servers: [],
  log: [],
}));

export function setDiagnostics(file: FileDiagnostics): void {
  useLspStore.setState((state) => {
    const next = new Map(state.diagnostics);
    if (file.diagnostics.length === 0) next.delete(file.path);
    else next.set(file.path, file.diagnostics);
    return { diagnostics: next };
  });
}

export function replaceDiagnostics(files: readonly FileDiagnostics[]): void {
  useLspStore.setState({
    diagnostics: new Map(files.map((file) => [file.path, file.diagnostics])),
  });
}

export function appendLspLog(line: LogLine): void {
  useLspStore.setState((state) => ({ log: [...state.log, line].slice(-MAX_LOG_LINES) }));
}

export interface ProblemCounts {
  errors: number;
  warnings: number;
}

export function countProblems(
  diagnostics: ReadonlyMap<string, readonly Diagnostic[]>,
): ProblemCounts {
  let errors = 0;
  let warnings = 0;
  for (const list of diagnostics.values()) {
    for (const diagnostic of list) {
      if (diagnostic.severity === 'error') errors += 1;
      else if (diagnostic.severity === 'warning') warnings += 1;
    }
  }
  return { errors, warnings };
}

const severityOrder = { error: 0, warning: 1, info: 2, hint: 3 } as const;

/** Files sorted by path, problems by severity, then position. */
export function sortedProblems(
  diagnostics: ReadonlyMap<string, readonly Diagnostic[]>,
): { path: string; diagnostics: Diagnostic[] }[] {
  return [...diagnostics.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, list]) => ({
      path,
      diagnostics: [...list].sort(
        (a, b) =>
          severityOrder[a.severity] - severityOrder[b.severity] ||
          a.range.start.line - b.range.start.line ||
          a.range.start.character - b.range.start.character,
      ),
    }));
}
