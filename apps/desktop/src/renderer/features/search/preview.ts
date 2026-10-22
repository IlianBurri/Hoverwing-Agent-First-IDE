import { buildSearchRegExp } from '@kestrel/shared';
import type { SearchMatch, SearchOptions } from '@kestrel/shared';

export interface PreviewParts {
  before: string;
  match: string;
  /** Replacement text, or null when no replace preview is shown. */
  replacement: string | null;
  after: string;
}

/**
 * Splits a match preview into before / match / after and computes what the
 * match would become, using the same RegExp as the actual replace.
 */
export function previewParts(
  match: SearchMatch,
  options: SearchOptions,
  replacement: string | null,
): PreviewParts {
  const { preview, previewStart, length } = match;
  const matched = preview.slice(previewStart, previewStart + length);
  let replaced: string | null = null;
  if (replacement !== null) {
    try {
      const regExp = buildSearchRegExp(options);
      replaced = matched.replace(
        new RegExp(regExp.source, regExp.flags.replace('g', '')),
        replacement,
      );
    } catch {
      replaced = null;
    }
  }
  return {
    before: preview.slice(0, previewStart).trimStart(),
    match: matched,
    replacement: replaced,
    after: preview.slice(previewStart + length),
  };
}
