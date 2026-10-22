import { splitGlobs } from '@kestrel/shared';
import type { SearchMatch, SearchOptions } from '@kestrel/shared';
import { HEAVY_DIRECTORIES } from '../workspace/heavy';

/** Longest preview text sent to the UI per match. */
const PREVIEW_CHARS = 160;
/** Characters of context shown before a match in the preview. */
const PREVIEW_CONTEXT = 40;

/** Command-line arguments for one ripgrep search (always JSON output). */
export function ripgrepArgs(options: SearchOptions): string[] {
  const args = [
    '--json',
    '--hidden',
    '--max-columns',
    '2000',
    '--max-filesize',
    '5M',
    options.caseSensitive ? '--case-sensitive' : '--ignore-case',
    // PCRE2 is closest to JavaScript regular expressions (used for replace).
    options.isRegex ? '--pcre2' : '--fixed-strings',
  ];
  if (options.wholeWord) args.push('--word-regexp');
  for (const name of ['.git', ...HEAVY_DIRECTORIES]) args.push('--glob', `!**/${name}/**`);
  for (const glob of splitGlobs(options.include)) args.push('--glob', glob);
  for (const glob of splitGlobs(options.exclude)) args.push('--glob', `!${glob}`);
  // "--" ends the options, so a query like "--help" is searched literally.
  args.push('--', options.query, '.');
  return args;
}

interface RipgrepMatchMessage {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches: { start: number; end: number }[];
  };
}

function isMatchMessage(value: unknown): value is RipgrepMatchMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as { type?: unknown; data?: { path?: { text?: unknown } } };
  return message.type === 'match' && typeof message.data?.path?.text === 'string';
}

/** ripgrep reports byte offsets; the editor needs character offsets. */
function charOffset(line: string, byteOffset: number): number {
  return Buffer.from(line, 'utf8').subarray(0, byteOffset).toString('utf8').length;
}

export interface ParsedMatches {
  path: string;
  matches: SearchMatch[];
}

/** Parses one line of `rg --json` output; null for non-match messages. */
export function parseRipgrepLine(jsonLine: string): ParsedMatches | null {
  let message: unknown;
  try {
    message = JSON.parse(jsonLine);
  } catch {
    return null;
  }
  if (!isMatchMessage(message)) return null;
  const { data } = message;
  const lineText = data.lines.text.replace(/\r?\n$/, '');
  const path = data.path.text
    .replace(/^\.[/\\]/, '')
    .split('\\')
    .join('/');
  const matches = data.submatches.map((submatch) => {
    const column = charOffset(lineText, submatch.start);
    const length = charOffset(lineText, submatch.end) - column;
    const previewFrom = Math.max(0, column - PREVIEW_CONTEXT);
    return {
      line: data.line_number,
      column,
      length,
      preview: lineText.slice(previewFrom, previewFrom + PREVIEW_CHARS).replace(/\t/g, '  '),
      previewStart: column - previewFrom,
    };
  });
  return { path, matches };
}
