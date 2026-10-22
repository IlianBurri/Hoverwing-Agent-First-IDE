/**
 * Folders that are usually huge and generated. They are shown in the file
 * tree but neither watched nor searched, which keeps big projects fast.
 */
export const HEAVY_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  '.gradle',
  '.idea',
]);

export function isHeavyDirectory(name: string): boolean {
  return HEAVY_DIRECTORIES.has(name);
}
