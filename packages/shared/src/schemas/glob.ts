/**
 * Minimal glob matching for permission rules and sensitive-file patterns.
 * Supports `**` (any number of folders), `*` (within one segment) and `?`.
 * Paths use "/" separators. Matching is case-insensitive, because macOS and
 * Windows file systems usually are (".ENV" must count as ".env").
 */
export function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index] ?? '';
    if (char === '*') {
      if (glob[index + 1] === '*') {
        // "**/" matches zero or more folders; a trailing "**" matches the rest.
        const followedBySlash = glob[index + 2] === '/';
        source += followedBySlash ? '(?:.*/)?' : '.*';
        index += followedBySlash ? 2 : 1;
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`, 'i');
}

export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path);
}
