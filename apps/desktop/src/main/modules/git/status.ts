import type { GitChangeKind, GitFile } from '@kestrel/shared';

export interface ParsedStatus {
  branch: string | null;
  head: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** Paths relative to the repository root. */
  files: GitFile[];
}

const kinds: Readonly<Record<string, GitChangeKind>> = {
  M: 'modified',
  T: 'typeChanged',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
};

const kind = (code: string | undefined): GitChangeKind | null =>
  code === undefined || code === '.' ? null : (kinds[code] ?? 'modified');

/** Splits off the first `count` space-separated fields; the rest is the path. */
function fields(line: string, count: number): { parts: string[]; rest: string } {
  const parts: string[] = [];
  let index = 0;
  for (let i = 0; i < count; i++) {
    const next = line.indexOf(' ', index);
    if (next === -1) return { parts: [...parts, line.slice(index)], rest: '' };
    parts.push(line.slice(index, next));
    index = next + 1;
  }
  return { parts, rest: line.slice(index) };
}

/**
 * Parses `git status --porcelain=v2 -z --branch`. Records are NUL-separated;
 * renames carry their original path in the following record.
 */
export function parseStatus(output: string): ParsedStatus {
  const status: ParsedStatus = {
    branch: null,
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    files: [],
  };
  const records = output.split('\0');
  for (let i = 0; i < records.length; i++) {
    const record = records[i] ?? '';
    if (record === '') continue;
    if (record.startsWith('# ')) {
      const { parts, rest } = fields(record.slice(2), 1);
      const [key] = parts;
      if (key === 'branch.oid') status.head = rest === '(initial)' ? null : rest.slice(0, 7);
      else if (key === 'branch.head') status.branch = rest === '(detached)' ? null : rest;
      else if (key === 'branch.upstream') status.upstream = rest;
      else if (key === 'branch.ab') {
        const match = /^\+(\d+) -(\d+)$/.exec(rest);
        status.ahead = Number(match?.[1] ?? 0);
        status.behind = Number(match?.[2] ?? 0);
      }
      continue;
    }
    switch (record[0]) {
      case '1': {
        const { parts, rest } = fields(record, 8);
        const xy = parts[1] ?? '..';
        status.files.push({
          path: rest,
          origPath: null,
          staged: kind(xy[0]),
          unstaged: kind(xy[1]),
          conflict: false,
        });
        break;
      }
      case '2': {
        const { parts, rest } = fields(record, 9);
        const xy = parts[1] ?? '..';
        const origPath = records[i + 1] ?? null;
        i += 1;
        status.files.push({
          path: rest,
          origPath,
          staged: kind(xy[0]),
          unstaged: kind(xy[1]),
          conflict: false,
        });
        break;
      }
      case 'u': {
        const { rest } = fields(record, 10);
        status.files.push({
          path: rest,
          origPath: null,
          staged: null,
          unstaged: 'modified',
          conflict: true,
        });
        break;
      }
      case '?':
        status.files.push({
          path: record.slice(2),
          origPath: null,
          staged: null,
          unstaged: 'untracked',
          conflict: false,
        });
        break;
      default:
        // "!" (ignored) is not requested; unknown records are skipped.
        break;
    }
  }
  return status;
}

/**
 * Makes repository-relative paths project-relative (the project may be a
 * sub folder of the repository). Files outside the project are left out.
 */
export function toProjectPaths(files: readonly GitFile[], prefix: string): GitFile[] {
  if (prefix === '') return [...files];
  const strip = (path: string) => (path.startsWith(prefix) ? path.slice(prefix.length) : null);
  const result: GitFile[] = [];
  for (const file of files) {
    const path = strip(file.path);
    if (path === null || path === '') continue;
    result.push({ ...file, path, origPath: file.origPath === null ? null : strip(file.origPath) });
  }
  return result;
}
