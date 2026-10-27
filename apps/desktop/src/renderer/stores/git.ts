import { create } from 'zustand';
import type { GitBranch, GitChangeKind, GitFile, GitStatus } from '@kestrel/shared';
import { parentPath } from '@kestrel/shared';
import type { LogLine } from './lsp';

/** Decoration of a file in the tree: letter + kind (color comes from the kind). */
export interface GitDecoration {
  letter: string;
  kind: GitChangeKind | 'conflict';
}

interface GitState {
  status: GitStatus | null;
  branches: readonly GitBranch[];
  /** An action is running (buttons are disabled meanwhile). */
  busy: boolean;
  /** Draft of the commit message (kept while switching views). */
  message: string;
  log: readonly LogLine[];
  decorations: ReadonlyMap<string, GitDecoration>;
  /** Folders that contain changed files. */
  changedFolders: ReadonlySet<string>;
}

const MAX_LOG_LINES = 500;

export const useGitStore = create<GitState>()(() => ({
  status: null,
  branches: [],
  busy: false,
  message: '',
  log: [],
  decorations: new Map(),
  changedFolders: new Set(),
}));

const letters: Record<GitChangeKind | 'conflict', string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typeChanged: 'T',
  untracked: 'U',
  conflict: '!',
};

export function decorationOf(file: GitFile): GitDecoration | null {
  const kind = file.conflict ? 'conflict' : (file.unstaged ?? file.staged);
  return kind ? { letter: letters[kind], kind } : null;
}

export function setGitStatus(status: GitStatus | null): void {
  const decorations = new Map<string, GitDecoration>();
  const changedFolders = new Set<string>();
  if (status?.state === 'repo') {
    for (const file of status.files) {
      const decoration = decorationOf(file);
      if (!decoration) continue;
      decorations.set(file.path, decoration);
      for (let dir = parentPath(file.path); dir !== ''; dir = parentPath(dir)) {
        changedFolders.add(dir);
      }
    }
  }
  useGitStore.setState({ status, decorations, changedFolders });
}

export function appendGitLog(line: LogLine): void {
  useGitStore.setState((state) => ({ log: [...state.log, line].slice(-MAX_LOG_LINES) }));
}

export interface GitGroups {
  conflicts: GitFile[];
  staged: GitFile[];
  changes: GitFile[];
  untracked: GitFile[];
}

/** Splits the status into the panel's sections (a file can be in two). */
export function groupFiles(files: readonly GitFile[]): GitGroups {
  const groups: GitGroups = { conflicts: [], staged: [], changes: [], untracked: [] };
  for (const file of files) {
    if (file.conflict) {
      groups.conflicts.push(file);
      continue;
    }
    if (file.staged) groups.staged.push(file);
    if (file.unstaged === 'untracked') groups.untracked.push(file);
    else if (file.unstaged) groups.changes.push(file);
  }
  const byPath = (a: GitFile, b: GitFile) => a.path.localeCompare(b.path);
  groups.conflicts.sort(byPath);
  groups.staged.sort(byPath);
  groups.changes.sort(byPath);
  groups.untracked.sort(byPath);
  return groups;
}
