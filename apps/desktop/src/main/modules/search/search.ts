import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { rgPath } from '@vscode/ripgrep';
import type { SearchFileResult, SearchOptions, SearchResult } from '@kestrel/shared';
import { parseRipgrepLine, ripgrepArgs } from './ripgrep';

/** Searches stop after this many matches to keep the UI responsive. */
export const MAX_MATCHES = 2000;
const TIMEOUT_MS = 30_000;

/**
 * Runs ripgrep in the workspace. One search per owner (window) at a time:
 * starting a new one, or calling `cancel`, stops the previous process.
 */
export class SearchRunner {
  private readonly running = new Map<number, ChildProcess>();

  constructor(private readonly binary: string = rgPath) {}

  cancel(ownerId: number): void {
    this.running.get(ownerId)?.kill();
    this.running.delete(ownerId);
  }

  find(ownerId: number, root: string, options: SearchOptions): Promise<SearchResult> {
    this.cancel(ownerId);
    const child = spawn(this.binary, ripgrepArgs(options), {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    this.running.set(ownerId, child);

    return new Promise((resolve, reject) => {
      const files = new Map<string, SearchFileResult>();
      let count = 0;
      let truncated = false;
      const timer = setTimeout(() => {
        truncated = true;
        child.kill();
      }, TIMEOUT_MS);

      const lines = createInterface({ input: child.stdout });
      lines.on('line', (line) => {
        if (truncated) return;
        const parsed = parseRipgrepLine(line);
        if (!parsed) return;
        const file = files.get(parsed.path) ?? { path: parsed.path, matches: [] };
        for (const match of parsed.matches) {
          if (count >= MAX_MATCHES) {
            truncated = true;
            child.kill();
            break;
          }
          file.matches.push(match);
          count++;
        }
        files.set(parsed.path, file);
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', () => {
        clearTimeout(timer);
        if (this.running.get(ownerId) === child) this.running.delete(ownerId);
        // Exit code 1 means "no matches"; a killed process is a cancelled or
        // truncated search. Both still return what was found so far.
        const sorted = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
        resolve({ files: sorted, truncated });
      });
    });
  }
}
