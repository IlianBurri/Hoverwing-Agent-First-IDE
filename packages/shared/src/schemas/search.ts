import { z } from 'zod';
import { relativePathSchema } from './workspace';

export const searchOptionsSchema = z.object({
  query: z.string().min(1).max(1000),
  isRegex: z.boolean(),
  caseSensitive: z.boolean(),
  wholeWord: z.boolean(),
  /** Comma-separated globs, e.g. "src/**, *.ts". Empty = everything. */
  include: z.string().max(1000),
  /** Comma-separated globs to skip, e.g. "*.test.ts". */
  exclude: z.string().max(1000),
});
export type SearchOptions = z.infer<typeof searchOptionsSchema>;

export const searchMatchSchema = z.object({
  /** 1-based line number. */
  line: z.number().int().positive(),
  /** 0-based character offset of the match in the full line. */
  column: z.number().int().nonnegative(),
  length: z.number().int().nonnegative(),
  /** The line (possibly shortened) and where the match starts in it. */
  preview: z.string(),
  previewStart: z.number().int().nonnegative(),
});
export type SearchMatch = z.infer<typeof searchMatchSchema>;

export const searchFileResultSchema = z.object({
  path: relativePathSchema,
  matches: z.array(searchMatchSchema),
});
export type SearchFileResult = z.infer<typeof searchFileResultSchema>;

export const searchResultSchema = z.object({
  files: z.array(searchFileResultSchema),
  /** True when the match limit was reached and the search stopped early. */
  truncated: z.boolean(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const replaceRequestSchema = z.object({
  options: searchOptionsSchema,
  replacement: z.string().max(10_000),
  paths: z.array(relativePathSchema).max(10_000),
});

export const replaceResultSchema = z.object({
  filesChanged: z.number().int().nonnegative(),
  replacements: z.number().int().nonnegative(),
  /** Files that could not be changed (e.g. deleted in the meantime). */
  failed: z.array(relativePathSchema),
});
export type ReplaceResult = z.infer<typeof replaceResultSchema>;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The JavaScript equivalent of a search, used for the replace preview and
 * for replacing. Throws a SyntaxError for invalid regular expressions.
 */
export function buildSearchRegExp(
  options: Pick<SearchOptions, 'query' | 'isRegex' | 'caseSensitive' | 'wholeWord'>,
): RegExp {
  let source = options.isRegex ? options.query : escapeRegExp(options.query);
  if (options.wholeWord) source = `\\b(?:${source})\\b`;
  return new RegExp(source, `gm${options.caseSensitive ? '' : 'i'}`);
}

/** Splits "a, b ,c" into ["a", "b", "c"]. */
export function splitGlobs(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}
