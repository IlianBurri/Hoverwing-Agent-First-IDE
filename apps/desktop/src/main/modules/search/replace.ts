import { buildSearchRegExp } from '@kestrel/shared';
import type { ReplaceResult, SearchOptions } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { readTextFile, writeTextFile } from '../workspace';

/** Builds the search RegExp or reports an invalid pattern to the user. */
export function searchRegExp(options: SearchOptions): RegExp {
  try {
    return buildSearchRegExp(options);
  } catch {
    throw new UserError('invalid_pattern', 'Invalid regular expression.');
  }
}

/**
 * Replaces all matches in the given files. Uses the same JavaScript rules
 * as the preview in the UI, so what the user saw is what gets written.
 */
export async function replaceInFiles(
  root: string,
  options: SearchOptions,
  replacement: string,
  paths: readonly string[],
): Promise<ReplaceResult> {
  const regExp = searchRegExp(options);
  const result: ReplaceResult = { filesChanged: 0, replacements: 0, failed: [] };

  for (const path of paths) {
    try {
      const file = await readTextFile(root, path);
      if (file.kind !== 'text') {
        result.failed.push(path);
        continue;
      }
      let count = 0;
      const next = file.content.replace(regExp, (...args: unknown[]) => {
        count++;
        // Re-run the replacement on the single match so "$1" etc. work.
        const match = String(args[0]);
        return match.replace(new RegExp(regExp.source, regExp.flags.replace('g', '')), replacement);
      });
      if (count === 0) continue;
      const written = await writeTextFile(root, path, next, file.mtimeMs);
      if (written.status === 'conflict') {
        result.failed.push(path);
        continue;
      }
      result.filesChanged++;
      result.replacements += count;
    } catch {
      result.failed.push(path);
    }
  }
  return result;
}
